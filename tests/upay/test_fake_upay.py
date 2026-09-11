"""The stub uPay, driven end to end against the real webhook over a real socket.

**What this covers that nothing else does.** `tests/upay/test_webhook.py` hands the webhook
a payload built by `app.integrations.upay.ipn`, which is our own code -- so it proves the
handler agrees with our simulator. `POST /dev/upay/simulate-ipn` delivers through the app's
own ASGI stack, so it never leaves the process. Neither involves *a form posted to a third
party that then calls us back*, which is the whole of §5.10 and the only place the
2026-09-11 defects lived: the white frame and the UUID a parent was asked to approve.

So this posts the real form fields at `scripts/fake-upay.py` running in its own process,
presses one of its buttons, and lets that process call the app -- itself listening on a
port -- exactly as uPay does.

**The stub is an independent witness, on purpose.** It transcribes the bytes uPay really
sent rather than importing `build_ipn_query`, so drift in our parser fails here instead of
being mirrored into agreement. That is also why the assertions are about the ORDER and the
CHARGES, the outcome a family cares about, rather than about any field's spelling.
"""

from __future__ import annotations

import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
import uvicorn
from app.main import app
from app.models.billing import Charge, PaymentOrder, UpayIpnRecord
from app.services.billing.orders import OrderService
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[2]
STUB = ROOT / "scripts" / "fake-upay.py"

#: Unroutable on purpose. The card route answers a 302 to this and nothing follows it --
#: what is asserted is the Location header, not that anything is listening there.
RETURN_URL = "http://127.0.0.1:1/#/payment-complete"


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _wait_for(url: str, *, timeout: float = 30.0) -> None:
    """Poll until something answers. Any HTTP answer counts, a 404 included -- what is
    being waited for is a process bound to a port, not a particular route."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return
        except urllib.error.HTTPError:
            return
        except Exception:  # noqa: BLE001 -- still starting
            time.sleep(0.1)
    raise TimeoutError(f"nothing answered at {url} within {timeout}s")


@pytest.fixture(scope="module")
def stub_port() -> Iterator[int]:
    """`scripts/fake-upay.py` in its own process, which is the point of it."""
    port = _free_port()
    process = subprocess.Popen(  # noqa: S603 -- our own script, fixed argv
        [sys.executable, str(STUB), "--port", str(port)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        _wait_for(f"http://127.0.0.1:{port}/health")
        yield port
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:  # pragma: no cover
            process.kill()


@pytest.fixture(scope="module")
def api_port(migrated) -> Iterator[int]:  # noqa: ANN001 -- session fixture, schema only
    """The real app on a real port, so the stub can reach it the way uPay does.

    `TestClient` will not do here: it never opens a socket, so a separate process could not
    call it, and "a separate process reached us unaided" is the entire claim of this file.
    The database is the same one every other test uses and rows are really committed, so
    the order arranged below is visible to these connections.
    """
    port = _free_port()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        _wait_for(f"http://127.0.0.1:{port}/api/v1/health")
        yield port
    finally:
        server.should_exit = True
        thread.join(timeout=10)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Not following the 302 IS one of the assertions -- see the card-route test."""

    def redirect_request(self, *_args, **_kwargs):  # noqa: ANN002, ANN003, ANN202
        return None


def _post(url: str, fields: dict[str, str]) -> tuple[int, str, str]:
    opener = urllib.request.build_opener(_NoRedirect)
    data = urllib.parse.urlencode(fields, encoding="utf-8").encode()
    try:
        with opener.open(urllib.request.Request(url, data=data), timeout=30) as response:
            return response.status, response.headers.get("Location", ""), response.read().decode()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("Location", ""), exc.read().decode()


def _form_fields(session, order: PaymentOrder, api_port: int) -> dict[str, str]:
    """The real form, with only the two URLs pointed at this test's own ports.

    Built by `OrderService.form_fields` rather than typed out: `paymentdetails` is the
    field under test, and a hand-written copy of it would pass whatever the builder did.
    """
    fields = OrderService(session).form_fields(order.public_ref, base_url="https://studio.example")
    fields["ipnurl"] = f"http://127.0.0.1:{api_port}/api/v1/webhooks/upay/{order.public_ref}"
    fields["returnurl"] = RETURN_URL
    return fields


def _checkout(stub_port: int, fields: dict[str, str]) -> str:
    status, _, body = _post(
        f"http://127.0.0.1:{stub_port}/API6/clientsecure/redirectpage.php", fields
    )
    assert status == 200, body[:300]
    return body


def _press(stub_port: int, fields: dict[str, str], outcome: str) -> tuple[int, str, str]:
    """Press one of the card page's buttons, as the browser would."""
    posted = {f"f_{k}": v for k, v in fields.items()}
    posted["outcome"] = outcome
    return _post(f"http://127.0.0.1:{stub_port}/pay", posted)


def _resolved(session, order_id: uuid.UUID, *, timeout: float = 20.0) -> PaymentOrder:
    """Wait for a callback fired from another process to land.

    Polled rather than slept: it crosses a socket and a thread, and how long that takes is
    not this test's to predict.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session.expire_all()
        order = session.get(PaymentOrder, order_id)
        if order is not None and order.status != "pending":
            return order
        time.sleep(0.2)
    session.expire_all()
    return session.get(PaymentOrder, order_id)


# -- the defect this file exists for ---------------------------------------------------


def test_the_bit_route_settles_without_ever_returning_to_our_origin(
    stub_port, api_port, an_order, tenant_session, a_merchant_email
):
    """2026-09-11, the first live payment. The money arrived and the browser never came
    back, so our completion `postMessage` -- posted only by our own return page -- was
    never posted, and the overlay sat on a white rectangle.

    Both halves are asserted here: the browser is NOT redirected anywhere, and the order
    settles anyway. The second is what makes polling the order row the right fix; the first
    is what makes it a necessary one.
    """
    fields = _form_fields(tenant_session, an_order.order, api_port)
    _checkout(stub_port, fields)

    status, location, body = _press(stub_port, fields, "bit")

    assert status == 200, "the bit route ends on uPay's own page, not on a redirect"
    assert location == "", f"nothing should send the browser back to us, got {location!r}"
    assert RETURN_URL not in body

    order = _resolved(tenant_session, an_order.order.id)
    assert order.status == "paid", "a real payment, delivered from another process"
    record = tenant_session.execute(
        select(UpayIpnRecord).where(UpayIpnRecord.order_public_ref == order.public_ref)
    ).scalar_one()
    assert record.match_status == "auto"
    for charge_id in an_order.charge_ids:
        assert tenant_session.get(Charge, charge_id).status == "settled"


def test_the_card_route_does_send_the_browser_back(
    stub_port, api_port, an_order, tenant_session, a_merchant_email
):
    """The contrast that makes the test above mean something. Same stub, same order, one
    different button -- and this one redirects, which is why the postMessage path worked
    for two years and hid the other route entirely."""
    fields = _form_fields(tenant_session, an_order.order, api_port)
    _checkout(stub_port, fields)

    status, location, _ = _press(stub_port, fields, "card")

    assert status == 302
    assert location == RETURN_URL
    assert _resolved(tenant_session, an_order.order.id).status == "paid"


# -- the other 2026-09-11 defect, seen from the payer's side ---------------------------


def test_the_payer_reads_the_club_s_name_and_the_reference_still_matches(
    stub_port, api_port, an_order, tenant_session, studio, a_merchant_email
):
    """The second defect, proven at both ends at once.

    bit renders `paymentdetails` to the payer, and it used to be a bare UUID -- which is
    what a real parent was asked to approve. The stub renders the same field the same way,
    so the first assertion is about what a human sees. The rest is the half that could have
    broken while fixing it: the reference travels inside that string, comes back as
    `productdescription`, and must still settle the order.

    A parser test alone would not have caught a break here, because the string never leaves
    our own process in one.
    """
    fields = _form_fields(tenant_session, an_order.order, api_port)
    page = _checkout(stub_port, fields)

    assert studio.name in page, "the payer is shown who is being paid"
    assert str(an_order.order.public_ref) in fields["paymentdetails"]

    _press(stub_port, fields, "bit")

    order = _resolved(tenant_session, an_order.order.id)
    assert order.status == "paid", "the decorated description still matched its order"
    record = tenant_session.execute(
        select(UpayIpnRecord).where(UpayIpnRecord.order_public_ref == order.public_ref)
    ).scalar_one()
    assert record.order_public_ref == an_order.order.public_ref


# -- the shapes that are not a success -------------------------------------------------


def test_an_amount_mismatch_crosses_the_socket_and_is_caught(
    stub_port, api_port, an_order, tenant_session, a_merchant_email
):
    """§5.10's fourth threat row, from a payload this repo did not build. One agora short:
    the charges must NOT settle, and the order must say so."""
    fields = _form_fields(tenant_session, an_order.order, api_port)
    _checkout(stub_port, fields)

    _press(stub_port, fields, "mismatch")

    order = _resolved(tenant_session, an_order.order.id)
    assert order.status == "amount_mismatch"
    for charge_id in an_order.charge_ids:
        assert tenant_session.get(Charge, charge_id).status == "open", (
            "money arrived at the wrong amount; nothing is settled until a human looks"
        )


def test_a_wrong_refername_is_a_200_carrying_a_rejection(stub_port):
    """The failure that reached production on 2026-08-31: HTTP 200, `text/plain`, and one
    line of English rendered as a page where the card form should have been.

    The stub reproduces it so that a future change to `REFERNAME` fails here rather than in
    front of a parent. Nothing in `app/` is exercised -- this is a claim about the stub's
    fidelity, and it is in this file because that is what the stub is for.
    """
    status, _, body = _post(
        f"http://127.0.0.1:{stub_port}/API6/clientsecure/redirectpage.php",
        {"amount": "1.00", "paymentdetails": str(uuid.uuid4()), "refername": "STUDIOMANAGER"},
    )

    assert status == 200, "a rejection dressed as a success is the whole trap"
    assert body.strip() == "wronginputrefername STUDIOMANAGER"
