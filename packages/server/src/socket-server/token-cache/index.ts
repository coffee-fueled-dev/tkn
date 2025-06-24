import { LRUCache } from "lru-cache";
import { type KeyGenerator, type LookupKey } from "../key-generators";
import { Preloader } from "./preloaders";
import pino from "pino";

const logger = pino({ name: "token-cache" });

export class TokenCache extends LRUCache<LookupKey, Uint8Array> {
  private keyGenerator: KeyGenerator;

  constructor(max: number, keyGenerator: KeyGenerator) {
    super({ max });
    this.keyGenerator = keyGenerator;
  }

  async preload(preloader: Preloader, data: Uint8Array[]) {
    await preloader.load(data);
  }

  add(prefix: Uint8Array) {
    const key = this.keyGenerator(prefix, prefix.length);
    return super.set(key, prefix);
  }

  contains(window: Uint8Array) {
    const key = this.keyGenerator(window, window.length);
    const result = super.has(key);
    logger.debug({ key, result }, "contains");
    return result;
  }

  retrieve(window: Uint8Array): Uint8Array | undefined {
    const key = this.keyGenerator(window, window.length);
    const result = super.get(key);
    logger.debug({ key, result }, "retrieve");
    return result;
  }
}
