import { LZST, TokenCache, RedisPublisher, keyGenerators } from "tkn-server";
import pino from "pino";
import { randomUUIDv7 } from "bun";
import path from "path";
import { mean, std } from "mathjs";

const BANK_SIZE = 1000;
const MAX_WINDOW_SIZE = 1024;
const WORKSPACE_ROOT = path.resolve(import.meta.dir, "../../../");
const FILE_PATH = path.join(
  WORKSPACE_ROOT,
  "corpora/tiny-stories-samples/output/tinystories_10_stories.txt"
);
const TENANT_ID = "word-segmentation";

const sessionId = randomUUIDv7();
const logger = pino({ name: TENANT_ID });
const decoder = new TextDecoder("utf-8", { fatal: false });
const publisher = new RedisPublisher("redis://localhost:6379");
const cache = new TokenCache(BANK_SIZE, keyGenerators.fastHash);
const lzst = new LZST(cache, MAX_WINDOW_SIZE);

logger.info({ filePath: FILE_PATH }, "Starting word segmentation analysis");

// Wait for Redis connection before starting
logger.info("Waiting for Redis connection...");
try {
  await publisher.getSubscriberCount();
  logger.info("Redis connection established");
} catch (error) {
  logger.warn(
    { error },
    "Redis connection failed, continuing without publishing"
  );
}

// Check if file exists
const file = Bun.file(FILE_PATH);
const exists = await file.exists();
if (!exists) {
  logger.error({ filePath: FILE_PATH }, "Corpus file not found");
  process.exit(1);
}

logger.info({ fileSize: file.size }, "Processing corpus file");

const stream = file.stream();
const opsDeltaT: number[] = [];
const tokenDeltaT: number[] = [];

for await (const chunk of stream) {
  for (const byte of chunk) {
    const now = performance.now();
    const result = lzst.processByte(byte);
    opsDeltaT.push(performance.now() - now);
    if (result.error) {
      logger.error(result.error);
    } else if (result.data) {
      tokenDeltaT.push(performance.now() - now);
      logger.debug({ ...result, text: decoder.decode(result.data.buffer) });
      try {
        await publisher.publish({
          sessionId,
          timestamp: Date.now(),
          buffer: result.data.buffer,
          sessionIndex: result.data.sessionIndex,
          tenantId: TENANT_ID,
          preloadUsed: "none",
        });
      } catch (error) {
        logger.debug({ error }, "Failed to publish token to Redis");
      }
    }
  }
}

logger.info({
  performance: {
    totalOperations: opsDeltaT.length,
    totalTokens: tokenDeltaT.length,
    opsDeltaT: {
      meanMs: Number(mean(opsDeltaT)).toFixed(4),
      stdMs: Number(std(opsDeltaT)).toFixed(4),
    },
    tokenDeltaT: {
      meanMs: Number(mean(tokenDeltaT)).toFixed(4),
      stdMs: Number(std(tokenDeltaT)).toFixed(4),
    },
    throughput: {
      opsPerMs: Number((1 / mean(opsDeltaT)).toFixed(2)),
      tokensPerMs: Number((1 / mean(tokenDeltaT)).toFixed(2)),
    },
  },
});
