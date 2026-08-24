# Static PWA service, own origin per app — see infra/railway/README.md.
# Build context is the repo root (Railway sets RAILWAY_DOCKERFILE_PATH).

FROM node:22-slim AS build
WORKDIR /repo
# The whole web/ tree, not just this app: package-lock.json references every
# workspace declared in web/package.json, so npm ci fails on a partial copy.
# .dockerignore keeps node_modules and dist out.
COPY web ./web
WORKDIR /repo/web
RUN npm ci
RUN npm run build --workspace @studio/dashboard

FROM caddy:2-alpine
COPY --from=build /repo/web/apps/dashboard/dist /srv/dist
COPY web/apps/dashboard/Caddyfile /etc/caddy/Caddyfile
