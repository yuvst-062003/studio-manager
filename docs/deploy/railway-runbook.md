# Railway runbook

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
