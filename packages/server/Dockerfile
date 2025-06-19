FROM oven/bun:1.1.34-alpine AS base

# Install curl for healthchecks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build the application (if needed)
RUN bun build src/index.ts --outdir ./dist --target bun

# Expose ports
EXPOSE 3000

# Set default environment variables
ENV NODE_ENV=production
ENV TKN_PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/metrics || exit 1

# Start the application
CMD ["bun", "run", "src/index.ts"] 