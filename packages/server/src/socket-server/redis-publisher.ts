import Redis from "ioredis";
import { variables } from "../environment";
import pino from "pino";

const logger = pino({ name: "redis-publisher" });
const { REDIS_URI } = variables;

export interface Token {
  buffer: Uint8Array;
  sessionIndex: number;
  sessionId: string;
  tenantId: string;
  timestamp: number;
  preloadUsed?: string;
}

export class RedisPublisher {
  private redis: Redis;
  private readonly CHANNEL = "tokens";

  constructor(redisUri: string = REDIS_URI) {
    this.redis = new Redis(redisUri, {
      // Optimize for high throughput
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      // Use pipeline for better performance
      enableAutoPipelining: true,
    });

    this.redis.on("error", (error) => {
      logger.error({ error }, "Redis connection error");
    });

    this.redis.on("connect", () => {
      logger.info("Redis publisher connected");
    });
  }

  async publish(token: Token): Promise<void> {
    try {
      // Convert Uint8Array to array for JSON serialization
      const serializable = {
        ...token,
        buffer: Array.from(token.buffer),
      };
      await this.redis.publish(this.CHANNEL, JSON.stringify(serializable));
    } catch (error) {
      logger.error({ error, token }, "Failed to publish token");
      throw error;
    }
  }

  async publishBatch(tokens: Token[]): Promise<void> {
    if (tokens.length === 0) return;

    try {
      // Use pipeline for batch publishing - much faster than individual publishes
      const pipeline = this.redis.pipeline();

      for (const token of tokens) {
        // Convert Uint8Array to array for JSON serialization
        const serializable = {
          ...token,
          buffer: Array.from(token.buffer),
        };
        pipeline.publish(this.CHANNEL, JSON.stringify(serializable));
      }

      await pipeline.exec();

      logger.debug({ count: tokens.length }, "Published token batch");
    } catch (error) {
      logger.error(
        { error, tokenCount: tokens.length },
        "Failed to publish token batch"
      );
      throw error;
    }
  }

  async getSubscriberCount(): Promise<number> {
    try {
      const result = (await this.redis.call(
        "PUBSUB",
        "NUMSUB",
        this.CHANNEL
      )) as [string, number];
      return result[1];
    } catch (error) {
      logger.error({ error }, "Failed to get subscriber count");
      return 0;
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
    logger.info("Redis publisher closed");
  }
}
