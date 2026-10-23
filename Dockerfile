# Torob in the Loop: reproducible build from source (multi-stage).
#
#   docker build -t torob-in-the-loop .
#   docker build --build-arg NPM_REGISTRY=https://package-mirror.liara.ir/repository/npm/ -t torob-in-the-loop .
#
# Needs data/catalog.db in the build context: it's prebuilt from the raw Torob CSVs with
# `npm run data:build` and can't be built here because the dataset is never shipped.
# For Liara, the faster Dockerfile.runtime is the default (see liara.json and docs/DEPLOY.md).
# Uses only classic Dockerfile syntax (no RUN --mount / COPY --chmod) so it builds on any
# builder: BuildKit, legacy docker build, kaniko or buildah.

ARG NODE_IMAGE=node:22-bookworm-slim

# ── 1. dependencies (cached until a package.json or the lockfile changes) ────
FROM ${NODE_IMAGE} AS deps
WORKDIR /src
ARG NPM_REGISTRY=""
ENV npm_config_fund=false \
    npm_config_audit=false \
    npm_config_update_notifier=false \
    npm_config_loglevel=warn
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/etl/package.json packages/etl/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
 && npm ci --include=dev \
 && npm cache clean --force

# ── 2. build web (Vite) + server (esbuild bundle → no runtime node_modules) ──
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
# Drop any dist/ that came with the context so the output is a pure function of the source.
RUN rm -rf apps/web/dist apps/server/dist \
 && npm run build \
 && test -s apps/server/dist/index.js \
 && test -s apps/server/dist/state-schema.sql \
 && test -s apps/web/dist/index.html

# ── 3. runtime: Node + three artifacts, nothing else ────────────────────────
FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=1.0.0
LABEL org.opencontainers.image.title="torob-in-the-loop" \
      org.opencontainers.image.description="Torob in the Loop: smart in-person shopping assistant for Tehran (Torob dataset)" \
      org.opencontainers.image.version="${APP_VERSION}"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    CATALOG_PATH=/app/data/catalog.db \
    STATE_DB_PATH=/var/lib/torob-in-the-loop/state.db \
    WEB_DIST=/app/apps/web/dist \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
RUN mkdir -p /var/lib/torob-in-the-loop \
 && chown node:node /var/lib/torob-in-the-loop
# Largest and least frequently changing layer first, so code-only releases reuse it.
# (Never chmod/chown these after COPY: that would duplicate the ~300 MB catalog in a new layer.)
COPY data/catalog.db ./data/catalog.db
COPY scripts/docker-entrypoint.sh scripts/healthcheck.mjs ./scripts/
COPY --from=build /src/apps/web/dist ./apps/web/dist
COPY --from=build /src/apps/server/dist ./apps/server/dist
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "/app/scripts/healthcheck.mjs"]
# The entrypoint starts as root only to fix ownership of a root-mounted state disk, then drops to
# the unprivileged `node` user (uid 1000) with setpriv and execs the server as PID 1.
ENTRYPOINT ["/bin/sh", "/app/scripts/docker-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "apps/server/dist/index.js"]
