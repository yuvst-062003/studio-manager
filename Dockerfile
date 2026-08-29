# API service. The three PWAs are separate services (see web/apps/*/Caddyfile) so
# staff and parent do not share origin-scoped IndexedDB — it holds pending_ops
# (§10.6) and health flags (G7).
FROM python:3.14-slim

WORKDIR /srv

COPY requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY app ./app

# app/core/cors.py resolves domains.json as parents[2] and reads it at import, so a
# missing file is not a degraded allowlist -- it is a container that cannot boot.
#
# jobs.json joined it when the monitor landed: app/core/jobs.py reads the declared
# schedule and each job's `max_silence_minutes`, which is what turns "no heartbeat" into
# "overdue" on the platform console. Named files rather than `COPY infra ./infra`, so the
# runtime image still carries no runbook -- and so that the next module reaching outside
# app/ has to say so here. tests/test_the_image_ships_what_the_api_reads.py is what makes
# that a rule instead of a habit; it fails on any module-level Path the image lacks.
COPY infra/railway/domains.json ./infra/railway/domains.json
COPY infra/railway/jobs.json ./infra/railway/jobs.json

# Migrations run as the deploy's pre-deploy step, inside Railway's network -- the database
# host is private, so `alembic upgrade head` cannot be run from a laptop. The package is a
# dependency; alembic.ini and the revisions are files, and without them the command fails
# on missing config rather than on anything to do with the schema.
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic

# The same sentence as the paragraph above, applied to the two scripts that also have to
# reach the private database: `railway ssh --service api` is the only shell that can, so
# a script absent from this image is a script that cannot be run against a deployed
# environment at all. By name rather than the whole directory -- the rest of scripts/ is
# a developer's shell tooling, and the runtime image carries no more of it than line 16
# carries of infra/.
COPY scripts/bootstrap-owner.py scripts/verify-db-roles.py ./scripts/

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
