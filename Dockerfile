# API service. The three PWAs are separate services (see web/apps/*/Caddyfile) so
# staff and parent do not share origin-scoped IndexedDB — it holds pending_ops
# (§10.6) and health flags (G7).
FROM python:3.14-slim

WORKDIR /srv

COPY requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY app ./app

# app/core/cors.py resolves this as parents[2] and reads it at import, so a missing file
# is not a degraded allowlist -- it is a container that cannot boot. Copied as the single
# file rather than infra/ so the runtime image carries no runbook and no jobs.json.
COPY infra/railway/domains.json ./infra/railway/domains.json

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
