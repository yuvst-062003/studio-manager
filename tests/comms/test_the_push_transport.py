"""HB-push-transport -- the wire behind `app/services/comms/push.py::PushSender`.

Two independent breaks, per the 2026-09-02 findings register's §2.1: no credential existed
anywhere in this repo, and the registration hooks never sent `applicationServerKey` even if
one had. This file is the first half -- the second is `usePushRegistration.ts`'s own tests.

`@patch("requests.post")` is `pywebpush`'s own convention for this (see its
`tests/test_webpush.py::test_send_vapid`): it fakes only the network call, so the real VAPID
JWT signing and the real RFC 8291 payload encryption both run for true, and a broken key or a
malformed subscription fails the test for the right reason instead of a mocked-away one.
"""

from __future__ import annotations

import base64
import json
import os
from unittest.mock import patch

from app.core.config import settings
from app.services.comms.push import (
    PushSendError,
    RecordingPushSender,
    WebPushSender,
    default_push_sender,
    push_transport_name,
)
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import SecretStr

#: A generated pair, valid for this test only -- not the one handed to Railway. Round-tripped
#: through `py_vapid.Vapid.from_string` in `test_a_generated_key_pair_round_trips` so a
#: mismatch between how the pair is generated and how `push.py` reads it fails loudly here
#: rather than on a real device.
_PRIVATE_KEY = "4m7XqbACJpe6cZobqZqTo9qopARb-3DeBoAcBwp2JmA"
_PUBLIC_KEY = (
    "BMBSB_lN3YIV7yLYWgOrfmzIoKyIHn5aJTenMlE99lC_DhRMryn3tcVzr3LuHLXFLIfIv_-tpfUSBE51uKeNbZY"
)


def _subscription() -> dict:
    """A browser's `PushSubscription.toJSON()`, with a genuine receiver key pair so the
    encryption step has something real to encrypt against -- an empty or fake `p256dh`
    fails inside `http_ece` before the network is ever reached, which would test the wrong
    thing."""
    recv_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    p256dh = base64.urlsafe_b64encode(
        recv_key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    ).decode()
    auth = base64.urlsafe_b64encode(os.urandom(16)).decode()
    return {
        "endpoint": "https://push.example.invalid/abcd",
        "keys": {"p256dh": p256dh, "auth": auth},
    }


def _sender() -> WebPushSender:
    return WebPushSender(private_key=_PRIVATE_KEY, subject="mailto:ops@example.invalid")


def test_a_generated_key_pair_round_trips():
    """The exact pair `scripts/` hands the operator to paste into Railway secrets must be
    readable back by `py_vapid.Vapid.from_string` -- the format `WebPushSender` reads settings
    through. A mismatch here means a key pair that looks fine and fails on the first send."""
    from py_vapid import Vapid

    vapid = Vapid.from_string(private_key=_PRIVATE_KEY)
    recovered = base64.urlsafe_b64encode(
        vapid.private_key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    ).rstrip(b"=")
    assert recovered.decode() == _PUBLIC_KEY


@patch("requests.post")
def test_a_send_signs_and_encrypts_for_real_and_returns_an_id(mock_post) -> None:
    mock_post.return_value.status_code = 201
    mock_post.return_value.headers = {}
    subscription = _subscription()

    message_id = _sender().send(
        token=json.dumps(subscription),
        title="ביטול שיעור",
        body="השיעור היום מבוטל",
        kind="session.cancelled",
        payload={},
    )

    assert message_id
    assert mock_post.call_args[0][0] == subscription["endpoint"]
    # A signed VAPID JWT, not a bare key -- `Bearer <header>.<claims>.<sig>`.
    sent_headers = mock_post.call_args[1]["headers"]
    assert sent_headers["authorization"].startswith("vapid ") or sent_headers[
        "authorization"
    ].startswith("Bearer ")


@patch("requests.post")
def test_the_title_and_body_are_encrypted_never_sent_in_the_clear(mock_post) -> None:
    """§18.3 -- a notification payload is in the "never logged" column, and a push service
    that could read the title off the wire would make every push provider a second place a
    child's name could leak. `aes128gcm` is the point of using Web Push at all rather than a
    bare HTTP callback."""
    mock_post.return_value.status_code = 201
    mock_post.return_value.headers = {}

    _sender().send(
        token=json.dumps(_subscription()),
        title="שם ילד סודי",
        body="עוד תוכן סודי",
        kind="belt.awarded",
        payload={"student_id": "secret-id"},
    )

    wire_body = mock_post.call_args[1]["data"]
    assert "שם ילד סודי".encode() not in wire_body
    assert b"secret-id" not in wire_body


@patch("requests.post")
def test_a_provider_refusal_becomes_a_push_send_error(mock_post) -> None:
    mock_post.return_value.status_code = 410
    mock_post.return_value.reason = "Gone"
    mock_post.return_value.text = ""
    mock_post.return_value.headers = {}

    try:
        _sender().send(
            token=json.dumps(_subscription()), title="t", body="b", kind="manual", payload={}
        )
        raised = False
    except PushSendError as exc:
        raised = True
        assert "410" in str(exc)
    assert raised


def test_a_malformed_token_is_a_push_send_error_not_a_crash() -> None:
    """A device row from before this transport existed, or corrupted in storage, must not
    take the whole drain down with it -- `app/workers/notify.py::_send_to_any` only knows how
    to catch `PushSendError`."""
    try:
        _sender().send(token="not json", title="t", body="b", kind="manual", payload={})
        raised = False
    except PushSendError:
        raised = True
    assert raised


def test_the_default_sender_is_recording_without_vapid_configured(monkeypatch) -> None:
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", None)
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", None)
    monkeypatch.setattr(settings, "VAPID_SUBJECT", None)

    sender = default_push_sender()
    assert isinstance(sender, RecordingPushSender)
    assert push_transport_name(sender) == "recording"


def test_the_default_sender_is_webpush_once_vapid_is_configured(monkeypatch) -> None:
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", _PUBLIC_KEY)
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", SecretStr(_PRIVATE_KEY))
    monkeypatch.setattr(settings, "VAPID_SUBJECT", "mailto:ops@example.invalid")

    sender = default_push_sender()
    assert isinstance(sender, WebPushSender)
    assert push_transport_name(sender) == "webpush"


def test_a_partially_configured_pair_still_falls_back(monkeypatch) -> None:
    """Half a key pair is not a key pair. A public key alone lets a browser subscribe but
    signs nothing; a private key alone signs but nobody's browser knows to trust it -- either
    way `RecordingPushSender` is the honest fallback, not a crash on a `None` where a string
    was expected."""
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", _PUBLIC_KEY)
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", None)
    monkeypatch.setattr(settings, "VAPID_SUBJECT", "mailto:ops@example.invalid")

    assert isinstance(default_push_sender(), RecordingPushSender)


# -- the tap-through (2026-09-13) ---------------------------------------------
@patch("app.services.comms.push.webpush")
def test_the_wire_carries_the_kind_so_a_tap_knows_where_to_open(mock_webpush) -> None:
    """`notificationclick` runs in the service worker, which has no session and no router --
    the only thing it can route on is what arrived in the message. Title and body say what
    happened; `kind` is the one field that says WHICH SCREEN it happened on, and without it
    every notification in the product can only open the app's front door.

    Patched at `webpush` rather than at `requests.post` (the convention the tests above use)
    because the payload leaves this process already encrypted -- asserting on the ciphertext
    is exactly what `test_the_title_and_body_are_encrypted_never_sent_in_the_clear` does, and
    this test needs to read the cleartext the device will decrypt.
    """
    mock_webpush.return_value.headers = {}

    _sender().send(
        token=json.dumps(_subscription()),
        title="חגורה חדשה!",
        body="נועה עלתה לחגורה צהובה",
        kind="belt.awarded",
        payload={"student_id": "s-1"},
    )

    data = json.loads(mock_webpush.call_args[1]["data"])
    assert data["kind"] == "belt.awarded"
    # Still present and still beside it -- the worker reads `payload.student_id` to build the
    # per-child link, so a `kind` that displaced the payload would trade one gap for another.
    assert data["payload"] == {"student_id": "s-1"}
    assert data["title"] == "חגורה חדשה!"


def test_the_recording_sender_takes_the_kind_too() -> None:
    """The two senders share one Protocol, and a `RecordingPushSender` that rejected the
    keyword would make every local run and every test crash the moment the drain started
    passing it -- which is the one environment where nobody would see a push fail."""
    sender = RecordingPushSender()
    message_id = sender.send(token="t", title="a", body="b", kind="session.cancelled", payload={})
    assert message_id


def test_the_key_pair_the_script_generates_actually_sends() -> None:
    """`scripts/generate-vapid-keys.py` → `WebPushSender`, end to end.

    The test above this one round-trips a pair that was PASTED into this file, which proves
    the format `push.py` reads and proves nothing at all about the script an operator will
    actually run. A generator that emitted padded base64, or the private key in DER, or the
    public key compressed rather than uncompressed, would pass every existing test here and
    fail on the first real device — with a provider error, hours later, on someone's phone.

    Imported by path because the filename has a dash and is therefore not importable as a
    module. That is deliberate: it is an operator script, not part of the package.
    """
    import importlib.util
    from pathlib import Path
    from unittest.mock import patch

    from py_vapid import Vapid

    spec = importlib.util.spec_from_file_location(
        "generate_vapid_keys", Path(__file__).resolve().parents[2] / "scripts/generate-vapid-keys.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    public, private = module.generate()

    # 1. `py_vapid` reads the private half back, and derives exactly the public half printed
    #    beside it -- a mismatched pair is the failure that only shows up on a device.
    vapid = Vapid.from_string(private_key=private)
    derived = base64.urlsafe_b64encode(
        vapid.private_key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    ).rstrip(b"=")
    assert derived.decode() == public

    # 2. The public half is what a browser is handed as `applicationServerKey`: 65 raw bytes,
    #    uncompressed point, base64url and unpadded. A compressed point decodes to 33 and
    #    `pushManager.subscribe` throws on it in the browser, where no test can see.
    assert len(base64.urlsafe_b64decode(public + "==")) == 65
    assert "=" not in public and "+" not in public and "/" not in public

    # 3. And a real send signs with it.
    with patch("requests.post") as mock_post:
        mock_post.return_value.status_code = 201
        mock_post.return_value.headers = {}
        sender = WebPushSender(private_key=private, subject="mailto:ops@example.invalid")
        assert sender.send(
            token=json.dumps(_subscription()),
            title="t",
            body="b",
            kind="session.cancelled",
            payload={},
        )
