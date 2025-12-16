# Multi-stage build for KubeKuma - API Server Only (Testing)

# Stage 1: Builder
FROM oven/bun:latest as builder

WORKDIR /build

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src
COPY tsconfig.json drizzle.config.ts ./

# Runtime stage
FROM oven/bun:latest

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Create app data directory
RUN mkdir -p /app/data

# Copy from builder
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./
COPY --from=builder /build/src ./src
COPY --from=builder /build/tsconfig.json ./

# Copy helper scripts
COPY seed-test-data.ts ./

# Create non-root user
RUN useradd -m -u 1001 kubekuma && chown -R kubekuma:kubekuma /app
USER kubekuma

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

# Run full server with controller and scheduler
CMD ["bun", "src/index.ts"]
