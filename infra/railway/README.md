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

§15 item 5 (a stable HTTPS domain) is **still outstanding**, and was deliberately
deferred out of M0 on 2026-08-25. It now blocks **W1**, and that is as far as it can
be pushed. `HB-domain` in [`state.yaml`](../../docs/plan/state.yaml) carries the record.

The reason people give for it is trust: an invitation link people install from should
not be a random subdomain — §6.5 makes the install the product's main adoption risk,
and an unfamiliar host is friction at exactly the wrong moment. That argument is real
but it does not set a date, which is how the item sat open.

**The one that does set a date is the cookie.** `up.railway.app` is on the
[Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat):

```
// Railway Corporation : https://railway.com
up.railway.app
```

So `parent-staging.up.railway.app` and `api-staging-1e4d.up.railway.app` are not merely
different origins — they are different **sites**. §11.7 puts the refresh token in a
`secure/httpOnly/SameSite` cookie and §5.2 gives it a 15-minute access JWT to refresh.
Across two sites that cookie is third-party, and Safari blocks third-party cookies
outright, so an iPhone parent's session dies after fifteen minutes and cannot renew.
`SameSite=None` does not rescue it; ITP is not a SameSite policy.

Three things follow, and the third is the trap:

1. **Local development hides it.** `localhost:5173 → localhost:8000` differ only by
   port, and a port is not part of a site. The cookie flows and every test is green.
2. **Any custom domain fixes it.** `app.<base> → api.<base>` is cross-origin but
   same-site, so a host-only `SameSite=Lax` cookie is sent normally. The separate
   origins that §Why-four-services requires for IndexedDB isolation still hold —
   origin and site are different boundaries, and only the wider one needs to match.
3. **The obvious workaround is the damage.** Faced with a dead session on staging, the
   natural fix is to move the refresh token into IndexedDB and send it as a bearer
   header. That contradicts §11.7 and is strictly weaker: an XSS can read IndexedDB and
   cannot read an httpOnly cookie. Once M1 ships that way it is the architecture, not a
   workaround. **Do not take it.** If the domain is not ready when M1 needs auth,
   stop and get the domain.

Moving to Vercel does not help — `vercel.app` is on the same list, for the same reason.

### The shape when it lands

Four subdomains of one registrable domain, no apex, no per-tenant hosts:

| | production | staging |
|---|---|---|
| api | `api.<base>` | `api.staging.<base>` |
| staff | `staff.<base>` | `staff.staging.<base>` |
| parent | `app.<base>` | `app.staging.<base>` |
| dashboard | `admin.<base>` | `admin.staging.<base>` |

Every one is a plain `CNAME` to Railway. Avoiding the apex is deliberate: it needs
`ALIAS`/`ANAME` support that not every registrar has, and it leaves the bare domain free
for a marketing page. Per-studio subdomains are a deliberate **no** — tenancy already
routes by session and invite token (§5.2, §5.3), so wildcards would buy a Railway tier and
a wildcard certificate for nothing. Keep cookies **host-only** (no `Domain=` attribute)
so a staging session is never valid against production.

Until it lands, these are Railway-generated subdomains. Every hostname lives in
[`domains.json`](domains.json) and nowhere else, so the swap is one file. Manifest
`start_url` and `scope` are relative, so no rebuild is needed either. Two things that
are *not* in that file will also need the host when it changes: the Google OAuth
redirect URIs in the Cloud Console, and the API's CORS allowlist — neither exists yet,
and both are M1's.

## The database

Staging gained a managed PostgreSQL in M0.2. It is not listed in
[`domains.json`](domains.json) — that file holds hostnames the apps are reached at, and
a database is not one. The connection strings live in Railway's own variables and are
referenced by the api service as `${{Postgres.DATABASE_URL}}`, so no DSN is ever written
into this repository.

Two open items are recorded in [the runbook](../../docs/deploy/railway-runbook.md): the
api service still connects as the superuser rather than as `studio_app`, and staging
runs PostgreSQL 18 where SPEC §8.1a pins 16.
