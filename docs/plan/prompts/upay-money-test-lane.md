# Prompt — the ₪1 money test, end to end, on production

Paste everything below the line into a new session.

---

You are running the **₪1 live money test** against **production**. This is real money, a real
card and a real club. Read this whole brief before touching anything.

## Why this exists

`upay_ipn_record` holds **zero rows in production and zero in staging**. No uPay callback has
ever reached this system, so the inbound half of §5.10 has never once run against the real
provider. Everything about it is inference. One ₪1 payment turns all of it into observation.

It also closes **checkpoint 19** of `docs/superpowers/specs/2026-09-10-dashboard-redesign.md`
(the receipt-link question) for free — see step 5.

## What is already established — do not re-derive

Checked on 2026-09-11 over `railway ssh --service api`:

- Production has two studios: `demo` (`is_demo=true`) and `gladiator` (the real one).
  **The demo studio cannot be used** — `GET /payment-orders/{ref}/form` answers **409
  `demo_studio_has_no_live_form`** by §19.6 restriction 5. The test must run in `gladiator`.
- `UPAY_MERCHANT_EMAIL` is set in production, and
  `OAUTH_REDIRECT_BASE_URL = https://api.gladiatorclub.co.il`, so the `ipnurl` handed to uPay
  is publicly reachable. There is no tunnel to set up.
- Production state before the test: **3 charges, all `open`; 4 payment_orders, all `expired`
  (created 7–8 Sep); 0 payments; 0 IPNs.** Nobody has ever completed a payment. The absence
  of IPNs is explained by that, and is not itself a defect — do not go hunting for a bug in
  the callback before a payment has actually been made.

Two things about the shape of the flow, both deliberate and both easy to get wrong:

- **There is no shareable payment link.** `GET /payment-orders/{public_ref}/form` returns
  `{action, fields}`, and the *client* builds and auto-submits a POST to
  `https://app.upay.co.il/API6/clientsecure/redirectpage.php`. You cannot hand the owner a
  URL; the payment happens inside the parent app.
- **The payer creates the order, never a manager.** `POST /payment-orders` takes the payer
  from the authenticated caller and never from the body — `app/routers/payments.py` explains
  why (a body-supplied payer would let anyone open an order over anyone's charges). So the
  test is driven from a **signed-in parent account that owns the charge**, not from an admin
  call.

## The test

1. **Make something to pay.** In `gladiator`, ensure a real payer has a charge of exactly
   **₪1 (100 agorot)**. Prefer creating a fresh ₪1 charge over reusing one of the three open
   ones — those belong to real families and settling them by accident is not recoverable
   politely. Confirm with the owner which student/payer to use before writing anything.
2. **Pay it.** The owner signs into the parent app (`https://app.gladiatorclub.co.il`) as
   that payer, opens the charge, and pays with a real card. Your job here is to watch, not to
   click — you cannot enter card details and must not ask for them.
3. **Watch the callback land.** Immediately after payment:
   ```
   railway ssh --service api "python -c \"
   import os, psycopg
   url=os.environ['DATABASE_URL'].replace('postgresql+psycopg://','postgresql://')
   conn=psycopg.connect(url)
   with conn, conn.cursor() as cur:
       cur.execute('SELECT count(*) FROM upay_ipn_record'); print('ipns:', cur.fetchone()[0])
       cur.execute('SELECT match_status, count(*) FROM upay_ipn_record GROUP BY 1'); print(cur.fetchall())
   \""
   ```
   `DATABASE_URL` carries SQLAlchemy's `postgresql+psycopg://` scheme, which psycopg itself
   rejects — the `.replace` above is required. **Do not let the raw URL reach an exception
   message**: psycopg prints the whole connection string, password included, and that
   happened once already on 2026-09-11.
4. **Then answer the four questions, in order.** Stop at the first that fails and report it
   rather than pressing on:
   - **Did it arrive?** `upay_ipn_record` gains a row.
   - **Did it match?** `match_status` should be `auto`. `unmatched` means §5.10's
     reconciliation could not tie it to the order — that is a real finding, and the
     reconciliation screen is where a human closes it.
   - **Did the money land?** The charge leaves `open`, and a `payment` row appears.
   - **Did the amount survive?** `app/integrations/upay/form.py` records that **a ₪1 payment
     returns `amount=1`, not `1.00`** — outbound and inbound formats differ. Check
     `amount_agorot` parsed to exactly `100`.
5. **Close checkpoint 19 while you are here.** `raw_query` holds the callback verbatim. Read
   its **parameter names only** — that row also holds a cardholder's name and their last four,
   and neither is needed:
   ```python
   from urllib.parse import parse_qsl
   keys = {k.lower() for k, _ in parse_qsl(raw, keep_blank_values=True)}
   print(sorted(keys))
   print([k for k in keys if any(w in k for w in ('invoice','receipt','doc','link','url','pdf'))])
   ```
   A uPay receipt URL is known to exist and be shareable —
   `https://app.upay.co.il/API6/s.php?m=<token>` — but the token is double-base64 around 16
   bytes of AES ciphertext, so it **cannot be constructed** from `transactionid` or anything
   stored. The only way the button in §3.20 can ever be built is if uPay *sends* the link in
   this payload. If a receipt-link key is present, store it and the button is trivial. If it
   is not, checkpoint 19's answer becomes permanent: no button, ever.

## Afterwards

₪1 is small but real. Ask the owner whether to reverse it (`POST /payments/{id}/reverse`
exists) or leave it as a paid charge. Do not decide that alone.

Record what happened in `docs/superpowers/specs/2026-09-10-dashboard-redesign.md` under
checkpoint 19, and in `SPEC.md`'s uPay section if the IPN's real shape differs from what the
integration notes assume — several of those notes are marked `[NOT COVERED]` precisely
because no live callback had ever been seen.

## Rails

- **Production, real money, a real club.** Confirm with the owner before every write.
- **Never read or ask for card details.** The cardholder name and last four exist in
  `raw_query` and on the reconciliation screen; read keys, not values, unless the owner asks
  for a specific row.
- `app/` is the API, `web/apps/parent/` is the payer's app. There is **no Alembic revision**
  in this task; if you think you need one, stop and say why.
- If the IPN never arrives at all, the next thing to check is whether uPay has the `ipnurl`
  registered for that merchant — the form sends it per-transaction, but some providers also
  gate it per account. That is a question for uPay's dashboard, not for the code.
