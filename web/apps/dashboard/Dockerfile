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
# The API origin the build bakes into apiUrl (packages/core/src/identity/session.ts) and
# the sign-in links (packages/ui/src/first-run/SignIn.tsx). Railway supplies it as a
# build arg from the service's VITE_API_ORIGIN variable; a build without it produces a
# dev-shaped bundle that expects a same-origin /api proxy, which no deployed host has.
ARG VITE_API_ORIGIN
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN
RUN npm run build --workspace @studio/dashboard

FROM caddy:2-alpine
COPY --from=build /repo/web/apps/dashboard/dist /srv/dist
COPY web/apps/dashboard/Caddyfile /etc/caddy/Caddyfile
