# Multi-stage build for KubeKuma

# Stage 1: Backend Builder
FROM oven/bun:latest as backend-builder

WORKDIR /build

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src
COPY tsconfig.json drizzle.config.ts ./

# Stage 2: Frontend Builder
FROM oven/bun:latest as frontend-builder

WORKDIR /build

# Copy frontend package files
COPY web/package.json web/bun.lock ./

# Install frontend dependencies
RUN bun install --frozen-lockfile

# Copy frontend source
COPY web/src ./src
COPY web/index.html web/vite.config.ts web/tsconfig.json web/tsconfig.node.json ./
COPY web/postcss.config.js web/tailwind.config.ts ./

# Build frontend
RUN bun run build

# Runtime stage
FROM oven/bun:latest

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Create app data directory
RUN mkdir -p /app/data /app/public

# Copy backend from builder
COPY --from=backend-builder /build/node_modules ./node_modules
COPY --from=backend-builder /build/package.json ./
COPY --from=backend-builder /build/src ./src
COPY --from=backend-builder /build/tsconfig.json ./
COPY --from=backend-builder /build/drizzle.config.ts ./

# Copy frontend build
COPY --from=frontend-builder /build/dist ./public

# Fix permissions and use existing bun user (uid 1000)
RUN chmod -R 755 /app

USER bun

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

# Run full server with controller and scheduler
CMD ["bun", "src/index.ts"]
