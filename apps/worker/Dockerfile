# PDF render worker — long-lived Hono server with a shared Puppeteer
# browser. Runs anywhere that takes a Dockerfile; the fly.toml in this
# directory is the deploy spec for Fly.io specifically.
#
# Build context is the *repo root* (Fly's `flyctl deploy` from
# apps/worker uses `--dockerfile` and `WORKDIR /repo` accordingly):
#   flyctl deploy --config apps/worker/fly.toml --dockerfile apps/worker/Dockerfile

# ---------- Stage 1: install + build (full toolchain) ----------
FROM node:20-bookworm-slim AS builder

# Speed: skip Puppeteer's chromium download in the build stage. The
# runtime stage uses the system chromium (apt-installed) instead.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH

RUN corepack enable

WORKDIR /repo

# Copy lockfile & workspace manifests first for cache-friendly installs.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/pdf/package.json packages/pdf/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --prod=false

# Now copy the actual sources and build the worker.
COPY tsconfig.base.json ./
COPY apps/worker apps/worker/
COPY packages/pdf packages/pdf/
COPY packages/db packages/db/
COPY packages/shared packages/shared/

RUN pnpm --filter @cheatsheet/worker build

# ---------- Stage 2: runtime ----------
# Puppeteer needs a Chromium binary plus its native deps. Installing
# `chromium` from Debian backports is the smallest reliable footprint;
# we point Puppeteer at the system binary via PUPPETEER_EXECUTABLE_PATH.
FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH

# Chromium + the shared libs it dlopen()s (fonts, X11, NSS, …).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-cjk \
      fonts-noto-color-emoji \
      ca-certificates \
      dumb-init \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Non-root user — Chromium refuses to run as root unless we pass
# --no-sandbox (which we do, but defence in depth is cheap).
RUN groupadd --system --gid 1001 worker \
    && useradd --system --uid 1001 --gid worker worker

WORKDIR /repo
COPY --from=builder --chown=worker:worker /repo /repo

USER worker
EXPOSE 4000

# dumb-init reaps zombie Chromium processes when a render crashes.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/worker/dist/index.js"]
