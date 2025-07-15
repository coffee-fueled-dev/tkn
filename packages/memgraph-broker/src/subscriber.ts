import Redis from "ioredis";
import { Router } from "./router";
import type { Token } from "./types";
import { variables } from "./environment";
import pino from "pino";
import { Decoder } from "./decoder";

const logger = pino({ name: "subscriber" });
const decoder = new Decoder(new TextDecoder("utf-8", { fatal: false }));

const { REDIS_URI, BASE_CHANNEL } = variables;

export class Subscriber {
  private readonly redis: Redis;
  private readonly router: Router;

  constructor() {
    this.redis = new Redis(REDIS_URI, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    this.router = new Router();
  }

  async listen() {
    await this.redis.subscribe(BASE_CHANNEL);
    logger.info(`Subscribed to Redis channel: ${BASE_CHANNEL}`);

    this.redis.on("message", (channel, message) => {
      try {
        const parsed = JSON.parse(message);
        // Convert buffer array back to Uint8Array
        const token: Token = {
          ...parsed,
          buffer: new Uint8Array(parsed.buffer),
        };

        this.router.pushToBroker(token);

        // Use decoder for logging
        const tokenString = decoder.decodeToken(token.buffer);
        logger.debug(
          `Routed token for session ${token.sessionId}: ${tokenString}`
        );
      } catch (error) {
        logger.error(`Failed to process message on channel ${channel}:`, error);
      }
    });
  }

  getRouter() {
    return this.router;
  }
}
