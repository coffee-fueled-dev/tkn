import {
  hashString,
  type KeyGenerator,
  type TokenCache,
} from "./key-generators";
import pino from "pino";

const logger = pino({ name: "preload" });

export const preload = {
  bpe: {
    tinyStoriesEnglish,
  },
};

/**
 * Preload LRU cache with BPE baseline tokens to reduce cold start times
 * @param cache - The LRU cache to preload
 */
async function tinyStoriesEnglish(
  cache: TokenCache,
  hashFunction: KeyGenerator
): Promise<number> {
  try {
    let baselineData: any = null;

    try {
      const bpeModule = await import(
        // File will be present at runtime in the container
        // @ts-ignore
        "../baseline/tokenizers/tkn_bpe_preload_2048.json"
      );
      baselineData = bpeModule.default || bpeModule;
      logger.info(
        { source: "src/baseline/tokenizers/tkn_bpe_preload_2048.json" },
        "Loading BPE baseline"
      );
    } catch (importError) {
      logger.info("No BPE baseline file found, skipping BPE preloading");
      return 0;
    }

    if (Array.isArray(baselineData)) {
      let preloadedCount = 0;

      for (const tokenInfo of baselineData) {
        try {
          const { value, token_id } = tokenInfo;

          if (typeof value === "string") {
            const key = hashString(value, hashFunction);

            cache.set(key, true);
            preloadedCount++;

            if (preloadedCount <= 5) {
              const keyDisplay =
                typeof key === "string"
                  ? `binary key length: ${key.length}`
                  : `hash: ${key}`;
              logger.info(
                {
                  value,
                  keyDisplay,
                  tokenId: token_id,
                  preloadedCount,
                },
                "Preloaded BPE token"
              );
            }
          }
        } catch (err) {
          logger.warn(
            { tokenValue: tokenInfo?.value, error: err },
            "Failed to preload BPE token"
          );
        }
      }

      logger.info(
        { preloadedCount },
        "Preloaded BPE baseline tokens into LRU cache"
      );
      return preloadedCount;
    }

    logger.warn("Invalid BPE baseline format, skipping");
    return 0;
  } catch (error) {
    logger.warn({ error }, "Failed to load BPE baseline");
    return 0;
  }
}
