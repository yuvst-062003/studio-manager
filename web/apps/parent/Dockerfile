# Static PWA service. Own origin per app — see infra/railway/README.md.
FROM node:22-slim AS build
WORKDIR /repo
COPY web/package.json web/package-lock.json ./web/
COPY web/packages ./web/packages
COPY web/apps/parent ./web/apps/parent
COPY web/tsconfig.base.json web/tsconfig.json ./web/
WORKDIR /repo/web
RUN npm ci --workspace @studio/parent --include-workspace-root
RUN npm run build --workspace @studio/parent

FROM caddy:2-alpine
COPY --from=build /repo/web/apps/parent/dist /srv/dist
COPY web/apps/parent/Caddyfile /etc/caddy/Caddyfile
