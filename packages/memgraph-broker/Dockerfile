# Runtime stage - Main application
FROM oven/bun:1.1.34-alpine AS runtime

# Install curl for healthchecks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy workspace package files
COPY package.json bun.lock* ./
COPY packages/memgraph-broker/package.json ./packages/memgraph-broker/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY packages/memgraph-broker/src ./packages/memgraph-broker/src
COPY packages/memgraph-broker/tsconfig.json ./packages/memgraph-broker/
COPY packages/shared/src ./packages/shared/src

# Build the TypeScript application
RUN bun build packages/memgraph-broker/src/index.ts --outdir ./packages/memgraph-broker/dist --target bun

# Expose ports
EXPOSE 4002

# Set default environment variables
ENV NODE_ENV=production
ENV PORT=4002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4002/health || exit 1

# Start the application
CMD ["bun", "run", "packages/memgraph-broker/src/index.ts"] 