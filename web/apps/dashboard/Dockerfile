# Static PWA service. Own origin per app — see infra/railway/README.md.
FROM node:22-slim AS build
WORKDIR /repo
COPY web/package.json web/package-lock.json ./web/
COPY web/packages ./web/packages
COPY web/apps/dashboard ./web/apps/dashboard
COPY web/tsconfig.base.json web/tsconfig.json ./web/
WORKDIR /repo/web
RUN npm ci --workspace @studio/dashboard --include-workspace-root
RUN npm run build --workspace @studio/dashboard

FROM caddy:2-alpine
COPY --from=build /repo/web/apps/dashboard/dist /srv/dist
COPY web/apps/dashboard/Caddyfile /etc/caddy/Caddyfile
