# Railway runbook

**Status 2026-08-24:** project `studio-manager` created
(`375bada8-df9f-4afe-8f24-aa37bb5da9ed`). `staging` and `development` are fully
provisioned with all four services; `production` exists but has **no service
instances** — see *Production is not yet populated* at the bottom.

Run once, by a human with the Railway account. The CLI is already installed
(`railway 5.43.1`). Every step below is outward-facing and billable.

## 1. Log in

```bash
railway login
```

Opens a browser. Confirm with:

```bash
railway whoami
```

## 2. Create the project and environments

Railway's default environment is `production` — do not create a fourth.

```bash
railway init --name studio-manager
railway environment new development
railway environment new staging
railway environment       # list, to confirm all three exist
```

## 3. Per environment, create the four services

`api` builds from the root `Dockerfile`; each PWA builds from
`web/apps/<app>/Dockerfile`.

```bash
railway environment staging

railway add --service api
railway up --service api --detach
railway domain --service api          # record the generated hostname

for app in staff parent dashboard; do
  railway add --service "$app"
  railway up --service "$app" --detach
  railway domain --service "$app"     # record the generated hostname
done
```

Repeat for `production`. `development` runs locally and needs no deployed
services, but the environment exists so config parity is explicit.

## 4. Environment variables

Per environment:

| Variable | development | staging | production |
|---|---|---|---|
| `ENV` | `development` | `staging` | `production` |

Nothing else yet. The AES-256-GCM envelope keys (§11.1) and the uPay merchant
credentials (§12) are added in their own milestones, and **never** land in git —
`.gitleaks.toml` carries a rule for each.

## 5. Record the hostnames

Paste the `railway domain` output into
[`infra/railway/domains.json`](../../infra/railway/domains.json). That file is the
only place a hostname appears.

## 6. Verify

```bash
curl -fsS "$(python3 -c "import json;print(json.load(open('infra/railway/domains.json'))['environments']['staging']['api'])")/api/v1/health"
```

Expect `{"status":"ok","env":"staging"}` — that is SPEC §15 item 3 satisfied.

Then:

```bash
.venv/bin/pytest tests/config/test_railway_config.py
```

The `PENDING-railway-login` placeholders make that suite fail on purpose until
this runbook has been run.


---

## Production is not yet populated

Railway services are **project-scoped by name**, but service *instances* are
per-environment. An environment created *before* the services exist comes up
empty and cannot be filled with `railway add` — the names are already taken, and
`railway up` fails with `404 Not Found` because there is no instance to upload to.

The supported fix is to recreate the environment as a duplicate of a populated
one:

```bash
railway environment delete production --yes
railway environment create production --duplicate staging
```

That worked for `development`. It was **not** run for `production`: the delete was
blocked by a safety guard, correctly — the command is destructive by name even
though this particular `production` is empty and destroys nothing.

Run those two lines by hand, then:

```bash
railway environment production
for s in api staff parent dashboard; do railway domain --service "$s"; done
railway variables --service api --set "ENV=production"
```

and paste the hostnames into `infra/railway/domains.json`. The remaining
`xfail(strict=True)` in `tests/config/test_railway_config.py` will turn into a
failure the moment they land, which is the signal to delete the marker.

## Cost note

`development` was created as a duplicate of `staging`, so it has four deployed
services of its own. `infra/railway/domains.json` points development at
`localhost` — the local dev loop does not use them. If they are not wanted:

```bash
railway environment delete development --yes
```

The environment can be recreated from `staging` in one command whenever it is.

## The staging database (M0.2)

Added with:

```bash
railway add --database postgres          # adds to the linked environment; there is no
                                         # --environment flag on `add`
railway variables --service api --environment staging --skip-deploys \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --set 'MIGRATION_DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --set 'APP_DB_ROLE=studio_app'
```

**Why two DSNs.** SPEC §11.2 requires the application role to hold `INSERT` on
`audit_log` and no `UPDATE` or `DELETE`. One role cannot both own the table and be
denied rights on it, so migrations run as a schema owner (`MIGRATION_DATABASE_URL`) and
the app connects as a runtime role (`DATABASE_URL`). Locally those are
`studio_migrator` and `studio_app`; see `docker-compose.yml` and
`infra/postgres/init/10-roles.sql`.

### Open item — the api service still connects as the superuser in staging

Railway's managed Postgres provides one role. Revision `0001` creates `studio_app` and
`0002` revokes `UPDATE` and `DELETE` on `audit_log` from it, so the grant §11.2 requires
is correct in every environment and `tests/core/test_audit_append_only.py` asserts it
against `has_table_privilege`. What is **not** yet true in staging is that the API
*uses* that role: both variables above point at the same superuser DSN.

M1 closes this by giving `studio_app` a login password from a Railway secret and
pointing `DATABASE_URL` at it. Until then, append-only is enforced by grant in tests and
in local development, and by convention in staging.

### Open item — staging runs PostgreSQL 18, SPEC §8.1a pins 16

`railway add --database postgres` provisions
`ghcr.io/railwayapp-templates/postgres-ssl:18`. `docker-compose.yml` and the CI service
container both run `postgres:16`, which is what §8.1a specifies, so the test suite
exercises 16 while staging runs 18. Nothing M0.2 uses differs between the two, but the
divergence is real and is a decision rather than an accident: either pin staging to a
16 image, or amend §8.1a to 18 and move local and CI with it. Do not leave it undecided
past W4, when the money ledger starts depending on this database.
