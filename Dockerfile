# API service. The three PWAs are separate services (see web/apps/*/Caddyfile) so
# staff and parent do not share origin-scoped IndexedDB — it holds pending_ops
# (§10.6) and health flags (G7).
FROM python:3.14-slim

WORKDIR /srv

COPY requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt

COPY app ./app

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
