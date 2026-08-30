# Production DNS — the eight records to add at LiveDNS

`gladiatorclub.co.il` is registered at LiveDNS. Owning the domain is not enough: **each
subdomain needs its own record.** Staging's four CNAMEs were created on 2026-08-26 and work;
production's were never created, because production itself did not exist until 2026-08-30.

The four custom domains are already registered on the Railway side — this file is the other
half, and it is the half only the domain owner can do.

Until these records resolve, production stays reachable on Railway's generated hostnames.
Nothing is down while you wait, and those URLs keep working afterwards as a fallback.

---

## Alias (CNAME) — 4 records

Every target is different. Do not copy the same one into all four.

### Record 1 — the API

- **hostname.domain:** `api.gladiatorclub.co.il`
- **target hostname:** `ukdfwvwe.up.railway.app`

### Record 2 — the staff app

- **hostname.domain:** `staff.gladiatorclub.co.il`
- **target hostname:** `ji0a6l0e.up.railway.app`

### Record 3 — the parent app

- **hostname.domain:** `app.gladiatorclub.co.il`
- **target hostname:** `vzgducot.up.railway.app`

### Record 4 — the manager dashboard

- **hostname.domain:** `admin.gladiatorclub.co.il`
- **target hostname:** `wjqbzw8s.up.railway.app`

---

## TXT — 4 records

Railway's proof that you control the domain. Every value is different.

### Record 5

- **hostname.domain:** `_railway-verify.api.gladiatorclub.co.il`
- **data:** `railway-verify=d12d792360a0ffbcfb39b9894f2c0fc6233f4699d7c8a45d2909459c34c28b89`
- **ttl:** `3600`

### Record 6

- **hostname.domain:** `_railway-verify.staff.gladiatorclub.co.il`
- **data:** `railway-verify=7dad526102d58f35db1e9abe2a102cc8868cce1fff063e2caa77d3d9152d0ace`
- **ttl:** `3600`

### Record 7

- **hostname.domain:** `_railway-verify.app.gladiatorclub.co.il`
- **data:** `railway-verify=6f489ebd35faefd27288e17e6c9ef0c3829d00906325327b944dbe81aef0afbd`
- **ttl:** `3600`

### Record 8

- **hostname.domain:** `_railway-verify.admin.gladiatorclub.co.il`
- **data:** `railway-verify=442c3d5db58c70bb2838471e69fa8bf671364826be9ed1296ba0a85b108c9c54`
- **ttl:** `3600`

---

## What to watch out for

**No scheme, no slash, no port in the target.** `ukdfwvwe.up.railway.app` — not
`https://ukdfwvwe.up.railway.app/`. If LiveDNS appends a trailing dot itself, that is normal
and correct.

**Keep the leading underscore** in `_railway-verify`. It is part of the name.

**A host cannot have a CNAME and anything else.** If any of these four names already carries
an A record or similar, delete it first — DNS forbids the combination. All four names are
new here, so this is unlikely.

**Nothing goes on the root (`@`).** Pointing the bare domain at Railway would take down
anything else served from it.

**Look for a Save / Apply / עדכון step.** Some panels stage edits and publish the zone only
when you confirm.

---

## Checking it worked

```bash
for h in api staff app admin; do
  printf '%-30s ' "$h.gladiatorclub.co.il"
  dig +short "$h.gladiatorclub.co.il" CNAME
done
```

Each line should print a `*.up.railway.app` target. Empty means the record has not
propagated yet — usually minutes, though Railway warns it can take up to 72 hours.

Railway issues the TLS certificates automatically once the records resolve; there is nothing
to do for HTTPS.

---

## The second half, after DNS resolves

DNS alone does not finish the job, because **the API origin is compiled into each frontend at
build time** and `app/core/cors.py` reads its allowlist from `infra/railway/domains.json` at
process start. Doing this before DNS resolves would break production on both hostnames at
once, which is why it is a separate step:

1. Update the four production hosts in `infra/railway/domains.json`.
2. `railway up --service api --environment production` — so CORS re-reads the file.
3. Set `VITE_API_ORIGIN=https://api.gladiatorclub.co.il` on `staff`, `parent` and `dashboard`.
4. Rebuild all three: `railway up --service <app> --environment production`.
5. Verify by fetching each app's served `/assets/index-*.js` and grepping for the new origin
   — a `railway up` that exits 0 proves nothing about what was baked in.

Roughly ten minutes, mostly build time.

## And one thing DNS does not fix

Google sign-in needs the production callback registered in the **Google Cloud console**, or
login never completes regardless of which hostname is used:

```
https://api.gladiatorclub.co.il/api/v1/auth/google/callback
```

Worth doing after the switch, so the address is entered once.
