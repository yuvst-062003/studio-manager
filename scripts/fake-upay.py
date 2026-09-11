#!/usr/bin/env python3
"""A stand-in for uPay, for the half of §5.10 no test could reach.

    .venv/bin/python scripts/fake-upay.py            # http://127.0.0.1:8099
    .venv/bin/python scripts/fake-upay.py --port 9000 --delay 5

── Why this exists ───────────────────────────────────────────────────────────────────
`POST /dev/upay/simulate-ipn` already fires a callback at our webhook, and it is the
right tool for what it does. What it cannot do is be a *page*: it is server-to-server, so
nothing it does ever involves the browser, the iframe, or where uPay sends the parent
afterwards. Every defect found on 2026-09-11 lived in exactly that gap.

This serves uPay's card page instead. It renders into the payment overlay's iframe, it
answers the buttons a parent presses, and it calls the `ipnurl` it was handed -- over real
HTTP, from a real other process, exactly as uPay does.

**It deliberately does NOT import from `app/`.** Not for tidiness: a stub that builds its
payload with `build_ipn_query` agrees with our parser by construction, and would keep
agreeing with it through any drift in either. The field list below is transcribed from the
bytes uPay actually sent on 2026-09-11 -- the first real callback this system has ever
received -- so it is an independent witness, and `tests/upay/test_fake_upay.py` is a real
round trip rather than a mirror. §19.6's "nothing outside `form.py` names uPay's endpoint"
also still holds, because this is not inside `app/`.

── What it reproduces, on purpose ────────────────────────────────────────────────────
* **The bit route never returns to `returnurl`.** That one fact is the whole white-frame
  defect: our completion `postMessage` is posted by our own return page, so on the bit
  route it is never posted at all. Pressing "bit" here fires the IPN and then sits on
  uPay's own thank-you page, which is what a real parent saw.
* **The amount comes back as `1`, not `1.00`.** Outbound and inbound formats differ.
* **`depositcashierid` is a different number from `transactionid`** (189128993 beside
  189129005 in the real capture). The `dev` simulator makes them identical, which is not
  what arrives.
* **`comment` is not empty.** It carried the payer's first name. The `dev` simulator sends
  "", and `ipn.py` still lists the field under "fields uPay sends empty".
* **`providerconfirmationnumber` is unrelated to `transactionid`**, and
  `commissionreduction` was `0`, not `1`.
* **`refername` is a case-sensitive allowlist** answering a 200 with a plain-text
  rejection body -- a rejection dressed as a success, which is how it reached production
  once already.

── Pointing the app at it ────────────────────────────────────────────────────────────
The form's `action` is `UPAY_ENDPOINT`, and §19.6 gives that constant exactly one home, so
nothing here overrides it. The client posts whatever `GET /payment-orders/{ref}/form`
returns as `action`, so the substitution belongs in front of that response:

    await page.route('**/api/v1/payment-orders/*/form', async (route) => {
      const body = await (await route.fetch()).json()
      const action = 'http://127.0.0.1:8099/API6/clientsecure/redirectpage.php'
      await route.fulfill({ json: { ...body, action } })
    })

Doing it there means production code has no test-only branch in it, and the merchant
endpoint cannot be repointed by configuration on a real deployment.
"""

from __future__ import annotations

import argparse
import html
import http.server
import socketserver
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

#: uPay's real path, mirrored so this is a drop-in for the action the form carries.
CHECKOUT_PATH = "/API6/clientsecure/redirectpage.php"

#: §5.10's weak signal, observed on the live callback and sent so a stubbed delivery looks
#: like a real one on the reconciliation row rather than arriving from nowhere.
IPN_SOURCE_IP = "84.95.87.35"

#: The one value this merchant account accepts. Every other value -- lowercase `upay`
#: included -- comes back as a 33-byte plain-text rejection with an HTTP 200.
REFERNAME = "UPAY"

#: uPay issues one id per transaction, from one sequence across the whole merchant
#: account -- and `uq_upay_ipn_record_transactionid` is global for exactly that reason. A
#: stub that reused an id would have its second payment correctly swallowed as a duplicate
#: delivery, which looks like the callback being lost and is in fact idempotency working.
#: Microseconds plus a counter, so two payments in the same second are still two payments.
_SEQUENCE = threading.Lock()
_ISSUED = [0]


def next_transaction_id() -> str:
    with _SEQUENCE:
        _ISSUED[0] += 1
        return str(189_000_000 + (time.time_ns() // 1_000 + _ISSUED[0]) % 100_000_000)


#: What the buttons on the card page mean.
OUTCOMES = {
    "card": "paid, and the browser is sent back to returnurl",
    "bit": "paid, and the browser is NEVER sent back to returnurl",
    "mismatch": "a different amount than the order expects",
    "decline": "a provider error code nobody has observed",
}


def ipn_amount(agorot: int) -> str:
    """Agorot -> uPay's **inbound** format. A ₪1 payment came back as `1`, not `1.00`."""
    whole, remainder = divmod(agorot, 100)
    return str(whole) if remainder == 0 else f"{whole}.{remainder:02d}"


def agorot_from_form_amount(text: str) -> int:
    """uPay's outbound decimal shekels -> agorot. Integers only; a float here would be the
    one bug this stub could introduce into an otherwise honest round trip."""
    whole, _, fraction = text.strip().partition(".")
    return int(whole or 0) * 100 + int((fraction or "").ljust(2, "0")[:2] or 0)


def build_ipn(fields: dict[str, str], outcome: str, transaction_id: str) -> dict[str, str]:
    """The 31 parameters, in the shape the live callback actually had.

    Transcribed from the 2026-09-11 capture rather than imported, so this can disagree with
    our parser -- see the module docstring. `productdescription` echoes `paymentdetails`
    verbatim, which is the rename round two confirmed three times out of three and the one
    thing the club-name change depends on.
    """
    agorot = agorot_from_form_amount(fields.get("amount", "0"))
    if outcome == "mismatch":
        # One agora, the smallest difference the server-side comparison must still catch.
        agorot -= 1
    rendered = ipn_amount(agorot)
    stamp = date.today().isoformat()
    declined = outcome == "decline"

    return {
        # -- outcome ------------------------------------------------------------------
        "providererrorcode": "36" if declined else "0",
        "errordescription": "DECLINED" if declined else "SUCCESS",
        "providererrordescription": "DECLINED" if declined else "SUCCESS",
        # Unrelated to transactionid in the real capture: 034283 beside 189129005.
        "providerconfirmationnumber": "034283",
        # -- money --------------------------------------------------------------------
        "amount": rendered,
        "depositamount": rendered,
        # ~1% is taken at settlement and never appears in the payload.
        "depositnetamount": rendered,
        "commissionreduction": "0",
        # -- installments -------------------------------------------------------------
        "firstpayment": "0",
        "constantpayment": "0",
        "numberpayments": fields.get("maxpayments", "1"),
        # -- the order reference ------------------------------------------------------
        # What the form sent as `paymentdetails`, echoed under uPay's own name for it.
        "productdescription": fields.get("paymentdetails", ""),
        "transactionid": transaction_id,
        # NOT the same number. The dev simulator makes these identical; uPay does not.
        "depositcashierid": str(int(transaction_id) - 12)
        if transaction_id.isdigit()
        else transaction_id,
        # -- card ---------------------------------------------------------------------
        "fourdigits": "4242",
        "cardownername": "ישראל ישראלי",
        "cardname": "MAX VISA",
        "cardtype": "VI",
        "companytype": "MAX",
        "clearer": "CAL",
        "foreign": "0",
        "expirydate": "0830",
        # uPay's internal channel label, NOT the instrument: the live capture read BIT for
        # a MAX VISA cleared by CAL. Never parse it as the payment method.
        "application": "BIT" if outcome == "bit" else "CARD",
        # -- merchant and dates -------------------------------------------------------
        "merchantnumber": "0000000",
        "email": fields.get("email", ""),
        "paymentdate": stamp,
        "actiondate": stamp,
        # -- the three that really do arrive empty, and the one that does not ----------
        # `comment` carried the payer's first name on the live callback.
        "comment": "יובל",
        "identitynumber": "",
        "cellphonenotify": "",
        "emailnotify": "",
    }


def deliver(ipn_url: str, query: dict[str, str], delay: float) -> None:
    """GET the callback at the `ipnurl` the form handed us, after `delay` seconds.

    Real uPay took 77 seconds on the one live payment. The delay is configurable because
    the interesting window is precisely the one where the parent is looking at a frame that
    has stopped being uPay's page and is not yet ours.
    """

    def run() -> None:
        if delay:
            time.sleep(delay)
        url = f"{ipn_url}{'&' if '?' in ipn_url else '?'}{urllib.parse.urlencode(query)}"
        request = urllib.request.Request(url, headers={"X-Forwarded-For": IPN_SOURCE_IP})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                print(f"  IPN -> {response.status} {ipn_url}", flush=True)
        except urllib.error.HTTPError as exc:
            print(f"  IPN -> {exc.code} {ipn_url}", flush=True)
        except Exception as exc:  # noqa: BLE001 -- a stub reports and keeps serving
            print(f"  IPN -> FAILED {type(exc).__name__}: {exc}", flush=True)

    threading.Thread(target=run, daemon=True).start()


def checkout_page(fields: dict[str, str]) -> bytes:
    """uPay's card page, reduced to the parts that matter for what we are testing.

    **`paymentdetails` is rendered large and verbatim**, because that string is what bit shows
    the payer -- it is the whole of the second defect. A UUID here means a parent is being
    asked to approve a hex string; a club name means they are not.
    """
    hidden = "".join(
        f'<input type="hidden" name="f_{html.escape(k)}" value="{html.escape(v)}">'
        for k, v in fields.items()
    )
    details = html.escape(fields.get("paymentdetails", ""))
    amount = html.escape(fields.get("amount", "0"))
    buttons = "".join(
        f'<button name="outcome" value="{key}" type="submit" class="pay-{key}">'
        f"{html.escape(label)}</button>"
        for key, label in (
            ("card", "שלם בכרטיס  ←  חוזר ל-returnurl"),
            ("bit", "שלם ב-bit  ←  לא חוזר ל-returnurl"),
            ("mismatch", "סכום שונה (amount_mismatch)"),
            ("decline", "סירוב (providererrorcode≠0)"),
        )
    )
    return f"""<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>uPay (stub)</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem;
          background: #f4f6fb; color: #12203f; }}
  .sheet {{ max-width: 34rem; margin-inline: auto; background: #fff; border-radius: 14px;
           padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,.12); }}
  .tag {{ font-size: .7rem; letter-spacing: .08em; color: #7b8db3; }}
  .amount {{ font-size: 2.5rem; font-weight: 800; }}
  .details {{ font-size: 1rem; word-break: break-all; background: #eef2fb;
              padding: .6rem .7rem; border-radius: 8px; margin-block: .75rem; }}
  button {{ display: block; inline-size: 100%; margin-block-start: .5rem; padding: .7rem;
            font: inherit; border: 0; border-radius: 10px; cursor: pointer; }}
  .pay-card {{ background: #0056c5; color: #fff; }}
  .pay-bit {{ background: #00e0d5; color: #05303a; font-weight: 700; }}
  .pay-mismatch, .pay-decline {{ background: #f1e3e3; color: #7c1d1d; }}
</style></head>
<body><div class="sheet">
  <p class="tag">UPAY STUB · not a real payment page</p>
  <p class="amount">{amount} ₪</p>
  <p class="tag">מה שהלקוח רואה כתיאור התשלום (paymentdetails):</p>
  <div class="details" data-testid="stub-paymentdetails">{details}</div>
  <form method="post" action="/pay" data-testid="stub-form">
    {hidden}{buttons}
  </form>
</div></body></html>""".encode()


def thanks_page(outcome: str) -> bytes:
    """uPay's own end-of-journey page for the bit route.

    **It does not navigate anywhere.** That is the defect, reproduced: our return page is
    never loaded, so the completion `postMessage` is never posted, and anything depending
    on that message alone waits for ever.
    """
    return f"""<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><title>uPay</title>
<style>body {{ font-family: system-ui, sans-serif; padding: 2rem; text-align: center;
  color: #12203f; }}</style></head>
<body data-testid="stub-thanks" data-outcome="{html.escape(outcome)}">
  <h1>התשלום התקבל</h1>
  <p class="tag">uPay stub — this page never returns to the merchant's returnurl.</p>
</body></html>""".encode()


class Handler(http.server.BaseHTTPRequestHandler):
    delay: float = 0.0

    def log_message(self, fmt: str, *args: object) -> None:  # quieter than the default
        print(f"  {self.command} {self.path}", flush=True)

    def _send(self, body: bytes, status: int = 200, content_type: str = "text/html") -> None:
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # The whole point is to be framed by the parent app, as the real one is.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _form(self) -> dict[str, str]:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8")
        return {k: v for k, v in urllib.parse.parse_qsl(raw, keep_blank_values=True)}

    def do_GET(self) -> None:  # noqa: N802 -- BaseHTTPRequestHandler's name
        if self.path.startswith("/health"):
            self._send(b"ok", content_type="text/plain")
            return
        self._send(
            b"upay stub: POST the form to " + CHECKOUT_PATH.encode(),
            status=404,
            content_type="text/plain",
        )

    def do_POST(self) -> None:  # noqa: N802
        path = urllib.parse.urlparse(self.path).path
        if path == CHECKOUT_PATH:
            self._checkout()
        elif path == "/pay":
            self._pay()
        else:
            self._send(b"not found", status=404, content_type="text/plain")

    def _checkout(self) -> None:
        fields = self._form()
        refername = fields.get("refername")
        if refername is not None and refername != REFERNAME:
            # A rejection dressed as a success: HTTP 200, text/plain, and the parent sees
            # one line of English where the card form should have been.
            self._send(
                f"wronginputrefername {refername}".encode(),
                content_type="text/plain",
            )
            return
        print(
            f"  checkout: amount={fields.get('amount')} "
            f"paymentdetails={fields.get('paymentdetails')!r}",
            flush=True,
        )
        self._send(checkout_page(fields))

    def _pay(self) -> None:
        posted = self._form()
        outcome = posted.get("outcome", "card")
        fields = {k[2:]: v for k, v in posted.items() if k.startswith("f_")}
        ipn_url = fields.get("ipnurl", "")
        transaction_id = next_transaction_id()

        if ipn_url:
            query = build_ipn(fields, outcome, transaction_id)
            print(f"  pay: outcome={outcome} ({OUTCOMES.get(outcome, '?')})", flush=True)
            deliver(ipn_url, query, self.delay)
        else:
            print("  pay: no ipnurl on the form -- nothing to deliver", flush=True)

        if outcome == "card" and fields.get("returnurl"):
            # The card route: uPay sends the browser back to the merchant. This is the
            # path that already worked, kept so the two can be compared.
            self.send_response(302)
            self.send_header("Location", fields["returnurl"])
            self.end_headers()
            return
        self._send(thanks_page(outcome))


class Server(socketserver.ThreadingTCPServer):
    """Threading, because `_pay` answers the browser while an IPN is in flight to a server
    that may itself be single-worker. Address reuse, because a stub gets restarted a lot."""

    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    parser = argparse.ArgumentParser(description="A stand-in for uPay's hosted card page.")
    parser.add_argument("--port", type=int, default=8099)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--delay",
        type=float,
        default=0.0,
        help="seconds to wait before firing the IPN (real uPay took 77s)",
    )
    args = parser.parse_args()

    Handler.delay = args.delay
    with Server((args.host, args.port), Handler) as server:
        print(f"upay stub on http://{args.host}:{args.port}{CHECKOUT_PATH}", flush=True)
        print(f"  IPN delay: {args.delay}s", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped", flush=True)


if __name__ == "__main__":
    main()
