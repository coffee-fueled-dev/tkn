import type { TokenCache } from "..";
import pino from "pino";

const logger = pino({ name: "preloader" });

export class Preloader {
  constructor(private cache: TokenCache) {}

  async load(data: Uint8Array[]): Promise<number> {
    let preloadedCount = 0;

    for (const bytes of data) {
      this.cache.add(bytes);
      preloadedCount++;
    }

    logger.info({ preloadedCount }, "Preloaded tokens into cache");
    return preloadedCount;
  }
}
