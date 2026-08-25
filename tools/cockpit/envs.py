"""Health probes over the three environments.

The fetcher is injected rather than imported so the classification logic is testable
without a network, a stub server or a sleep. `fetch_json` is the only part that
touches urllib, and it has no branching worth testing.
"""

from __future__ import annotations

import json
import socket
import ssl
import urllib.error
import urllib.request
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

STATES = frozenset({"up", "down", "unknown", "not_deployed", "local"})

# infra/railway/domains.json writes this literal for services that do not exist yet.
_PLACEHOLDER = "PENDING"

Fetcher = Callable[[str, float], dict[str, Any]]


@dataclass(frozen=True)
class EnvStatus:
    name: str
    state: str
    revision: str | None = None
    started_at: str | None = None
    detail: str | None = None


def targets(domains_json: dict[str, Any]) -> dict[str, str]:
    return {name: str(conf["api"]) for name, conf in domains_json.get("environments", {}).items()}


def _ssl_context() -> ssl.SSLContext | None:
    """A CA bundle, if one can be found without requiring a dependency.

    macOS python.org builds ship no trust store -- ssl.get_default_verify_paths().cafile
    is None -- so every HTTPS probe fails verification and staging reads `unknown`
    forever while curl fetches the same URL fine. certifi is already present as a
    transitive dependency, but the import is guarded: this package must still boot when
    nothing third-party is installed, so a missing certifi falls back to the default
    context rather than raising.
    """
    try:
        import certifi
    except ImportError:
        return None
    return ssl.create_default_context(cafile=certifi.where())


def fetch_json(url: str, timeout: float) -> dict[str, Any]:
    request = f"{url}/api/v1/health"
    context = _ssl_context() if request.startswith("https://") else None
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
        body: dict[str, Any] = json.loads(response.read().decode("utf-8"))
    return body


def _is_local(url: str) -> bool:
    return "localhost" in url or "127.0.0.1" in url


def _unreachable(name: str, exc: BaseException) -> EnvStatus:
    """Could not reach it. Not the same as it being down, and saying "down" would send
    you debugging an environment that is fine."""
    return EnvStatus(name=name, state="unknown", detail=str(exc))


def _refused(name: str, exc: BaseException) -> EnvStatus:
    return EnvStatus(name=name, state="down", detail=str(exc))


def classify(
    name: str, url: str, fetch: Fetcher, *, is_remote: bool, timeout: float = 2.0
) -> EnvStatus:
    if _PLACEHOLDER in url:
        return EnvStatus(name=name, state="not_deployed", detail="no service configured")
    if is_remote and _is_local(url):
        # Not a fact about the environment — a fact about who is looking. Rendering this
        # as down would be the observer's limitation dressed up as an outage.
        return EnvStatus(name=name, state="local", detail="not reachable from here")
    try:
        body = fetch(url, timeout)
    except urllib.error.URLError as exc:
        # urllib wraps the underlying OSError, so the refusal has to be unwrapped or a
        # server that is definitively refusing reports as merely unreachable.
        reason = exc.reason
        return (
            _refused(name, reason)
            if isinstance(reason, ConnectionRefusedError)
            else _unreachable(name, exc)
        )
    except ConnectionRefusedError as exc:
        return _refused(name, exc)
    except (TimeoutError, socket.gaierror) as exc:
        return _unreachable(name, exc)
    except (ValueError, KeyError) as exc:
        return EnvStatus(name=name, state="down", detail=f"unreadable response: {exc}")
    return EnvStatus(
        name=name,
        state="up" if body.get("status") == "ok" else "down",
        revision=None if body.get("revision") is None else str(body["revision"]),
        started_at=None if body.get("started_at") is None else str(body["started_at"]),
    )


def probe_all(
    target_map: dict[str, str], fetch: Fetcher, *, is_remote: bool = False, timeout: float = 2.0
) -> tuple[EnvStatus, ...]:
    with ThreadPoolExecutor(max_workers=max(1, len(target_map))) as pool:
        futures = [
            pool.submit(classify, name, url, fetch, is_remote=is_remote, timeout=timeout)
            for name, url in target_map.items()
        ]
        return tuple(future.result() for future in futures)
