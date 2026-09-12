"""Generate the VAPID key pair HB-push-transport signs with, and print it ready to paste.

    .venv/bin/python scripts/generate-vapid-keys.py

**One pair per environment, and never the same pair twice.** The public half is handed to
every subscribing browser and is baked into each `PushSubscription` the browser creates. So
rotating a pair does not merely change a credential: every existing subscription was made
against the OLD public key and stops being signable, and every device has to re-subscribe.
`usePushRegistration.ts`'s launch reconcile is what picks that up, but it only runs when the
app is opened — so a rotation means a slow tail of devices going quiet, not a clean cut. Do
it once per environment and keep it.

**The private half is a secret and this script never writes it to disk.** It goes straight
into Railway's variables for the `api` service. `app/core/config.py` reads all three, and
`default_push_sender()` falls back to `RecordingPushSender` unless every one is present — so
setting two of three leaves the environment silently recording pushes instead of sending
them, which is the failure this file's docstring exists to prevent.

`VAPID_SUBJECT` must be a `mailto:` or `https:` URL identifying the sender. Push services
use it to reach a human when a sender misbehaves; a bare email address without the scheme is
rejected by some of them at send time and by none of them at subscribe time, which makes it
the kind of mistake that only shows up on a real device.

The format is what `py_vapid.Vapid.from_string` reads back, which is what
`WebPushSender.__init__` is handed — `tests/comms/test_the_push_transport.py`'s
`test_a_generated_key_pair_round_trips` asserts those two agree.
"""

from __future__ import annotations

import base64

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64(raw: bytes) -> str:
    """base64url, unpadded — RFC 4648 §5, the encoding Web Push uses throughout."""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def generate() -> tuple[str, str]:
    """(public, private), both base64url and unpadded.

    P-256 because RFC 8292 permits nothing else: the VAPID JWT is ES256, full stop.
    """
    key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    private = _b64(key.private_numbers().private_value.to_bytes(32, "big"))
    public = _b64(
        key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    )
    return public, private


def main() -> None:
    public, private = generate()
    print("A new VAPID key pair. Set all three on the api service, in ONE environment.\n")
    print(f"VAPID_PUBLIC_KEY={public}")
    print(f"VAPID_PRIVATE_KEY={private}")
    print("VAPID_SUBJECT=mailto:<an address a push service can reach you at>")
    print(
        "\nrailway variables --service api --set VAPID_PUBLIC_KEY=... "
        "--set VAPID_PRIVATE_KEY=... --set VAPID_SUBJECT=...\n"
        "\nThe private half is not written to any file. Losing it costs every existing\n"
        "subscription, because each one was made against the public half above."
    )


if __name__ == "__main__":
    main()
