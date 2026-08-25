"""The laptop surface: routes, the page token, and the SSE stream.

Loopback only, and token-gated. The threat is not a person with a shell on this
machine -- they already have the shell -- but any page in any browser that can reach
127.0.0.1. A random per-process token embedded in the served page is what that page
cannot read, and no CORS header is ever sent so it cannot ask.
"""

from __future__ import annotations

import json
import secrets
import sys
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from tools.cockpit import ROOT, derive, envs, state
from tools.cockpit.local import signals
from tools.cockpit.local.commands import COMMANDS
from tools.cockpit.local.runner import BusyError, CommandError, ConfirmRequiredError, Runner

HOST = "127.0.0.1"
DEFAULT_PORT = 7317
STATIC = Path(__file__).resolve().parent / "static"
DOMAINS = ROOT / "infra/railway/domains.json"


def _new_token() -> str:
    return secrets.token_urlsafe(24)


PAGE_TOKEN = _new_token()
RUNNER = Runner()


def build_state_payload() -> dict[str, Any]:
    """Everything the page needs that can be read from disk. Deliberately no network:
    /api/state must never be slow, so the env probes live on their own route."""
    current = state.load()
    git = signals.git_state()
    active = derive.active_wave(current)
    piece = derive.active_piece(active) if active else None
    return {
        "updated": current.updated.isoformat(),
        "waves": [
            {
                **{k: v for k, v in asdict(wave).items() if k != "pieces"},
                "opened": wave.opened.isoformat() if wave.opened else None,
                "progress": asdict(derive.wave_progress(wave)),
                "pieces": [
                    {
                        **asdict(piece_),
                        "on": piece_.on.isoformat() if piece_.on else None,
                        "opened": piece_.opened.isoformat() if piece_.opened else None,
                        "progress": asdict(derive.piece_progress(piece_)),
                    }
                    for piece_ in wave.pieces
                ],
            }
            for wave in current.waves
        ],
        "active": {
            "wave": {"id": active.id, "milestone": active.milestone, "title": active.title}
            if active
            else None,
            "piece": {"id": piece.id, "title": piece.title} if piece else None,
        },
        # Tiered by distance, not grouped by kind: sixteen items with an M11 entry
        # beside an M0 one is a list, not a status board.
        "holdbacks": {
            tier: [
                {
                    **asdict(h),
                    "opened": h.opened.isoformat() if h.opened else None,
                    "closed": h.closed.isoformat() if h.closed else None,
                    "wave": derive.wave_index_for(current, h.blocks),
                }
                for h in items
            ]
            for tier, items in derive.tier_holdbacks(current).items()
        },
        "git": asdict(git),
        "runs": {cid: asdict(record) for cid, record in signals.latest_runs().items()},
        "staleness": asdict(derive.staleness(current, signals.commits_since(current.updated))),
        "commands": [
            {
                "id": c.id,
                "label": c.label,
                "takes_vertical": c.takes_vertical,
                "confirm": c.confirm,
            }
            for c in COMMANDS.values()
        ],
    }


def build_envs_payload() -> dict[str, Any]:
    targets = envs.targets(json.loads(DOMAINS.read_text(encoding="utf-8")))
    return {"envs": [asdict(s) for s in envs.probe_all(targets, envs.fetch_json, is_remote=False)]}


class Handler(BaseHTTPRequestHandler):
    server_version = "cockpit"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        """Quiet. The output pane is for command output, not for access logs."""

    def _authorised(self) -> bool:
        # An Origin header means a browser page on some other origin initiated this. No
        # CORS header is ever sent, so a compliant browser would refuse to show it the
        # response -- but refusing outright is one fewer thing resting on the browser.
        if self.headers.get("Origin"):
            return False
        return secrets.compare_digest(self.headers.get("X-Cockpit-Token", ""), PAGE_TOKEN)

    def _send(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, payload: dict[str, Any]) -> None:
        self._send(code, json.dumps(payload).encode("utf-8"), "application/json")

    def _not_found(self) -> None:
        self._send(404, b"not found", "text/plain; charset=utf-8")

    def do_GET(self) -> None:  # noqa: N802 -- BaseHTTPRequestHandler's contract
        parsed = urlparse(self.path)
        if parsed.path == "/":
            page = (STATIC / "index.html").read_text(encoding="utf-8")
            body = page.replace("{{TOKEN}}", PAGE_TOKEN).encode("utf-8")
            self._send(200, body, "text/html; charset=utf-8")
            return
        if not self._authorised():
            self._not_found()
            return
        if parsed.path == "/api/state":
            self._json(200, build_state_payload())
        elif parsed.path == "/api/envs":
            self._json(200, build_envs_payload())
        elif parsed.path.startswith("/api/run/") and parsed.path.endswith("/stream"):
            self._stream(parsed.path.split("/")[3])
        else:
            self._not_found()

    def do_POST(self) -> None:  # noqa: N802 -- BaseHTTPRequestHandler's contract
        if urlparse(self.path).path != "/api/run" or not self._authorised():
            self._not_found()
            return
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self._json(400, {"error": "malformed json"})
            return
        try:
            run_id = RUNNER.start(
                str(body.get("command", "")),
                body.get("vertical") or None,
                body.get("nonce") or None,
            )
        except ConfirmRequiredError as exc:
            self._json(409, {"error": "confirm_required", "nonce": exc.nonce})
        except BusyError as exc:
            self._json(409, {"error": "busy", "detail": str(exc)})
        except CommandError as exc:
            self._json(400, {"error": "refused", "detail": str(exc)})
        else:
            self._json(200, {"run": run_id})

    def _stream(self, run_id: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        # close, not keep-alive: there is no Content-Length on a stream, so closing the
        # connection is the only thing that tells the client the body has ended. With
        # keep-alive the last frame arrives and then both curl and fetch wait forever.
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            for line in RUNNER.stream(run_id):
                self.wfile.write(f"data: {json.dumps(line)}\n\n".encode())
                self.wfile.flush()
        except BrokenPipeError, ConnectionResetError, KeyError:
            # The reader went away, or the run id is unknown. Neither is worth a 500
            # after the headers have already gone out.
            return


def serve(port: int = DEFAULT_PORT) -> None:
    httpd = ThreadingHTTPServer((HOST, port), Handler)
    print(f"cockpit → http://{HOST}:{port}/  (token {PAGE_TOKEN[:8]}…)")
    httpd.serve_forever()


if __name__ == "__main__":
    serve(int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT)
