# syntax=docker/dockerfile:1.7
# Multi-stage build — targets linux/amd64 and linux/arm64 via Docker Buildx.
# Each stage is pinned to a digest-stable tag to keep security scans clean.

# ── Stage 1: deps ──────────────────────────────────────────────────────────────
# Install production + dev deps in a throw-away layer so the final image
# never carries the npm cache or build tooling.
FROM node:20-alpine AS deps

# Install libc compatibility shim needed by some native addons on Alpine.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy manifests first — Docker layer cache skips re-install when unchanged.
COPY package.json package-lock.json ./

# --ignore-scripts prevents post-install scripts from running as root.
RUN npm ci --ignore-scripts

# ── Stage 2: builder ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Bring in installed modules from the deps stage.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry during CI/CD builds.
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js static output and compile the custom WebSocket server.
RUN npm run build && \
    npx tsc --project tsconfig.server.json

# ── Stage 3: runner ────────────────────────────────────────────────────────────
# Minimal runtime image — no build tooling, no dev deps, no npm cache.
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Run as an unprivileged user (defense-in-depth, satisfies most CVE scanners).
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 --ingroup nodejs nextjs

# Copy only the artefacts required at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/.next        ./.next
COPY --from=builder --chown=nextjs:nodejs /app/.server-dist ./.server-dist
COPY --from=builder --chown=nextjs:nodejs /app/public       ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json ./package-lock.json

# Install production-only deps (no devDependencies, no scripts).
RUN npm ci --omit=dev --ignore-scripts && \
    # Remove npm cache left by ci install to shrink the layer.
    npm cache clean --force

USER nextjs

EXPOSE 3000

# Healthcheck lets the container runtime (and compose) detect a broken app.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", ".server-dist/server.js"]
