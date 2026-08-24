# Railway environments

Three environments — `development`, `staging`, `production` — each running four
services: `api` plus one static service per PWA.

## Why four services and not one

Each PWA gets **its own origin**. Serving them from one origin under `/staff/`,
`/parent/` and `/dashboard/` would work for service-worker scoping, but the three
apps would then share origin-scoped IndexedDB. That store holds `pending_ops`
(§10.6) and cached health flags (G7) — data the parent app has no business being
able to read. Separate origins is the cheaper half of that trade.

## Why the staging URL matters early

SPEC §15 item 3: uPay IPN testing in W4 needs a public HTTPS endpoint. Standing
staging up in M0 rather than W4 removes that as a late blocker.

## The domain

§15 item 5 (a stable HTTPS domain) is **still outstanding**. An invitation link
people install from should not be a random subdomain — §6.5 makes the install the
product's main adoption risk, and an unfamiliar host is friction at exactly the
wrong moment.

Until it lands, these are Railway-generated subdomains. Every hostname lives in
[`domains.json`](domains.json) and nowhere else, so the swap is one file. Manifest
`start_url` and `scope` are relative, so no rebuild is needed either.
