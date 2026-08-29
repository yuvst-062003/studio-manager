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

A grant on a role the api does not connect as protects nothing. It is the most dangerous
shape a security control can take, because it passes every test: the audit log looks like
evidence right up until the moment someone needs it to be.

#### What M1.12 shipped

The code half, which is measurable from a keyboard:

* `app/core/db_roles.py` asks the **live connection** what it actually is —
  `has_table_privilege(current_user, 'audit_log', …)`, never a lookup against
  `APP_DB_ROLE`. A check that trusted the setting would report whatever the config
  claimed, which is exactly what was wrong here.
* `app/main.py`'s lifespan runs it on every boot. **Production refuses to serve** on a
  role that can mutate `audit_log`; every other environment logs a warning naming the
  fix. A production deploy that refuses is visible in thirty seconds; one that quietly
  runs as a superuser is visible far too late. Staging warns rather than refusing because
  the unenforced condition is true there *today*, and a gate that has to be disabled in
  order to deploy is a gate that gets deleted.
* An unreachable database returns `None` and never fails a boot. This answers a question
  about grants; when it cannot ask, it stands aside rather than turning a database blip
  into a failed deploy.
* `scripts/verify-db-roles.py` is the same measurement by hand. Exit `0` enforced, `1` not
  enforced, `2` could not reach the database — three outcomes, because "could not check"
  is not the same answer as "enforced" and conflating them lets a network blip read as a
  pass.

#### The three steps that close it — **not yet done**

These need the Railway project and cannot be done from the repository.

**1. Give the role a login and a password.** As the superuser, once per environment. A
migration must never express a credential, which is why this is here and not in
`alembic/versions/`.

```bash
# generate one; do not reuse anything
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

railway connect Postgres --environment staging
```
```sql
ALTER ROLE studio_app WITH LOGIN PASSWORD '<the generated password>';
GRANT CONNECT ON DATABASE railway TO studio_app;
```

**2. Point `DATABASE_URL` at it, and leave `MIGRATION_DATABASE_URL` alone.** That split is
the mechanism, not a leftover: one role cannot both own `audit_log` and be denied rights
on it.

```bash
railway variables --service api --environment staging --skip-deploys \
  --set 'STUDIO_APP_DB_PASSWORD=<the generated password>' \
  --set 'DATABASE_URL=postgresql+psycopg://studio_app:${{STUDIO_APP_DB_PASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}'
# MIGRATION_DATABASE_URL stays on ${{Postgres.DATABASE_URL}} — the schema owner.
```

**3. Prove it, then close the holdback.** Not before: the code being written is not the
same claim as the role being in force.

```bash
railway run --service api --environment staging .venv/bin/python scripts/verify-db-roles.py
```

Expected output is `connected as : studio_app` with `UPDATE : False` and `DELETE : False`.
`HB-staging-superuser` in `docs/plan/state.yaml` stays **open** until that command has
printed it against staging.

Repeat all three for production at the W7 cutover, where step 2 is also what makes the
lifespan check stop refusing.

### Settled — everything runs PostgreSQL 18

`railway add --database postgres` provisions
`ghcr.io/railwayapp-templates/postgres-ssl:18`. Rather than fight the platform for a 16
image we would then maintain ourselves, SPEC §8.1a, `docker-compose.yml` and the CI
service container all moved to **PostgreSQL 18** (decided 2026-08-24). Local, CI and
staging now run the same major, which is the property that actually matters: testing
against a different major is how a difference reaches production untested.
`tests/config/test_database_config.py` asserts the CI image, so the three cannot drift
apart again silently.

## Encryption keys (SPEC §11.1)

Staging holds key version 1, set as a Railway secret and never written to a file:

```bash
KEY=$(.venv/bin/python -c 'import base64,os;print(base64.b64encode(os.urandom(32)).decode())')
railway variables --service api --environment staging --skip-deploys \
  --set "ENCRYPTION_KEYS={\"1\":\"$KEY\"}" --set 'ENCRYPTION_ACTIVE_KEY_VERSION=1'
unset KEY
```

**Rotation is `rewrap`, not re-encryption.** Add the new version to `ENCRYPTION_KEYS`
alongside the old one and bump `ENCRYPTION_ACTIVE_KEY_VERSION`. Existing rows keep
decrypting immediately — each blob records the version that wrapped it. A background
pass then calls `app.core.encryption.rewrap()` per row, which re-encrypts the 48-byte
data key and leaves the payload byte-identical, so no health declaration is ever held in
plaintext to rotate a key. Only once every row reports the new version via
`key_version_of()` may the old key be dropped from `ENCRYPTION_KEYS`.

Locally the key lives in `.env`, which is gitignored. `.env.example` carries an
all-zero placeholder so the shape is documented without a usable key being committed.

## Scheduled jobs

[`infra/railway/jobs.json`](../../infra/railway/jobs.json) is the source of truth for
what runs on a schedule and why; `tests/config/test_jobs_config.py` asserts **both**
directions — every declared command points at a module that exists, so a rename fails
the build rather than silently stopping a job, and every runnable module is declared, so
a worker cannot ship dead. The second half was added after four had: `billing`,
`schedule`, `health_reminders` and `privacy` each had a `main()`, a `__main__` block and
no cron entry anywhere.

**Still manual, and this is the half that has actually been wrong:** Railway's cron is
configured per service in the dashboard. Create a cron service for each entry in that
file, in **the environment the entry's `environment` field names** — `demo-reset` is
staging-only, the other seven are production — using its `schedule` and `command`
verbatim. A `jobs.json` entry on its own schedules nothing. This is the one half of the
mechanism no test can reach; if the dashboard and the file disagree, the file is right.

Current entries, and where each must exist:

| Job | Environment | Schedule (Asia/Jerusalem) |
|---|---|---|
| `demo-reset` | staging | `0 2 * * *` |
| `plan-changes` | production | `30 2 * * *` |
| `billing-run` | production | `30 8 * * *` |
| `people-followups` | production | `0 9 * * *` |
| `health-reminders` | production | `30 9 * * *` |
| `comms-notify` | production | `*/15 * * * *` |
| `sessions-complete` | production | `0 * * * *` |
| `privacy-requests` | production | `20 * * * *` |
| `ops-check` | **every environment** | `*/15 * * * *` |

The order of the first four is load-bearing, not cosmetic: `plan-changes` must apply a
downgrade before `billing-run` bills the month, and `billing-run` and `health-reminders`
must both sit after 08:00 because they enqueue notifications directly and `comms-notify`
drains them within fifteen minutes — the quiet-hours refusal lives in `ReminderService`,
which neither path goes through, so for those two the cron hour is the hour a parent's
phone lights up.

---

## Monitoring, and how to know a job stopped

`ops-check` is the only entry above that belongs in **every** environment, and it is the
one the other eight are watched by. Each job now writes a `job_run` row on every pass
(`app/core/jobs.py`), `ops-check` compares each job's last SUCCESSFUL run against the
`max_silence_minutes` it declares in `jobs.json`, and the platform console at
`#/platform` shows the result.

**This is deliberately not an error hook.** Four workers were scheduled nowhere for a
whole milestone and nothing noticed, because a job that never runs raises nothing. What is
measured is the success and its time; silence is the signal.

**`ops-check` cannot detect its own silence.** If it stops running, nothing is emailed —
the same failure one level up. Its own heartbeat is on the console like every other job's,
which makes the gap visible to somebody who looks. Closing it properly needs a pinger
outside the box, which is the hosted vendor this design deliberately does without. If that
trade stops being acceptable, an external uptime check on `GET /api/v1/health` is the
smallest thing that fixes it.

### Email alerts

Off until configured, and the console says so in as many words rather than implying a
channel that does not exist. stdlib `smtplib`, so there is no new dependency and no
vendor — point it at any SMTP host (Gmail with an app password, Fastmail, whatever
already sends your mail). STARTTLS on 587 only; implicit TLS on 465 is deliberately
unsupported, because choosing between them from a port number risks sending credentials
in the clear.

```bash
railway variables --service api \
  --set "ALERT_EMAIL_TO=you@example.com" \
  --set "SMTP_HOST=smtp.gmail.com" \
  --set "SMTP_PORT=587" \
  --set "SMTP_USERNAME=you@example.com" \
  --set "SMTP_PASSWORD=<an app password, never your account password>"
```

An alert fires only when the set of failing checks GROWS, so a job broken over a weekend
is one email rather than two hundred and eighty-eight. Recovery is silent, and clears the
memory so the same failure recurring later is news again.

### The console

`#/platform` in the dashboard app, offered only to a `platform_admin`. It carries the
operations board and §5.1's studio provisioning — list clubs, provision one, invite its
owner, suspend it — which had working endpoints since M1 and no caller in `web/` at all.

**There is still no route that creates a `platform_admin`, on purpose.** `PlatformAdmin`'s
docstring is the rule: "a console able to mint its own operators would make the top of the
chain self-issuing." `scripts/bootstrap-owner.py` remains the only thing in the repo that
writes that row, run over `railway ssh --service api`, and the person being made an
operator must have signed in once first so their `auth_identity` exists.

### Applying the migration

Migrations do not run on deploy — the Dockerfile CMD is uvicorn only, and the database
host is private to Railway's network. Deploy the image FIRST (it carries the revision),
then:

```bash
railway ssh --service api
python -m alembic upgrade head
```

`00cc140ce237` adds `job_run` and `ops_event`. Until it is applied, `#/platform` answers
500 on its board — the tables it reads do not exist yet.

