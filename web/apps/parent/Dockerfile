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
# #25 -- which hosts serve the club's landing page at their ROOT, and whose club. Vite
# substitutes `import.meta.env.X` at BUILD time, and a Docker build sees a Railway service
# variable only if the Dockerfile declares it as an ARG: setting the variable on the service
# is necessary and not sufficient. Both were set and the first production build shipped
# without them, so `www` served the sign-in wall instead of the shop window -- caught by
# grepping the deployed bundle, not by anything that fails a build.
#
# Absent is the old behaviour exactly (`landingSlugFor` answers null), so a build without
# them is degraded rather than broken -- which is why nothing shouted.
ARG VITE_LANDING_SLUG
ENV VITE_LANDING_SLUG=$VITE_LANDING_SLUG
ARG VITE_LANDING_HOSTS
ENV VITE_LANDING_HOSTS=$VITE_LANDING_HOSTS
RUN npm run build --workspace @studio/parent

FROM caddy:2-alpine
COPY --from=build /repo/web/apps/parent/dist /srv/dist
COPY web/apps/parent/Caddyfile /etc/caddy/Caddyfile
