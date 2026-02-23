# ═══════════════════════════════════════════════════════════════════════════════
# Backend Dockerfile — Multi-stage build for minimal production image
# ═══════════════════════════════════════════════════════════════════════════════
#
# To customize:
#   - Change Node version: update the FROM line
#   - Add system deps: add apk add in the base stage
#   - Change entry point: update CMD at the bottom
# ═══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: Build TypeScript ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc --outDir dist

# ── Stage 3: Production image (minimal) ───────────────────────────────────────
FROM node:20-alpine AS runner

# Security: non-root user
RUN addgroup -g 1001 -S openclaw && \
    adduser -S openclaw -u 1001

WORKDIR /app

# Copy only what's needed
COPY --from=deps --chown=openclaw:openclaw /app/node_modules ./node_modules
COPY --from=builder --chown=openclaw:openclaw /app/dist ./dist
COPY --from=builder --chown=openclaw:openclaw /app/package.json ./

# Create directories for runtime data
RUN mkdir -p uploads reports && chown -R openclaw:openclaw uploads reports

USER openclaw

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "dist/server.js"]
