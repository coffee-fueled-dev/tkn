# Build stage - Generate BPE baseline
FROM python:3.11-alpine AS baseline-builder

# Install Python dependencies for baseline generation
RUN pip install --no-cache-dir tokenizers datasets

# Set working directory
WORKDIR /build

# Copy corpus preparation scripts from the new corpora/ structure
COPY corpora/bpe.py ./
COPY corpora/requirements.txt ./
COPY corpora/tiny-stories-samples/download_stories.py ./tiny-stories-samples/
COPY corpora/tiny-stories-samples/requirements.txt ./tiny-stories-samples/

# Install corpus dependencies
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir -r tiny-stories-samples/requirements.txt

# Download 50k TinyStories sample and generate BPE baseline for server preloading
# This creates tkn_bpe_preload_2048.json with 2048 BPE tokens for LRU cache preloading
RUN cd tiny-stories-samples && \
    python3 download_stories.py 50000 -o tinystories_50k_sample.txt && \
    cd .. && \
    python3 bpe.py tiny-stories-samples/output/tinystories_50k_sample.txt --vocab-size 2048 --output-dir ./tokenizers

# Runtime stage - Main application
FROM oven/bun:1.1.34-alpine AS runtime

# Install curl for healthchecks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy workspace package files
COPY package.json bun.lock* ./
COPY packages/server/package.json ./packages/server/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY packages/server/src ./packages/server/src
COPY packages/server/tsconfig.json ./packages/server/
COPY packages/shared/src ./packages/shared/src

# Copy generated baseline from build stage
COPY --from=baseline-builder /build/tokenizers ./packages/server/src/baseline/tokenizers

# Build the TypeScript application
RUN bun build packages/server/src/index.ts --outdir ./packages/server/dist --target bun

# Expose ports
EXPOSE 3000

# Set default environment variables
ENV NODE_ENV=production
ENV TKN_PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/metrics || exit 1

# Start the application
CMD ["bun", "run", "packages/server/src/index.ts"] 