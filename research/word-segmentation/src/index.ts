import { LZST, Preloader, TokenCache, keyGenerators } from "tkn-server";
import pino from "pino";
import path from "path";
import { readFile } from "./read-file";
import { runSession } from "./session";

const HIGH_CONFIDENCE_BANK_SIZE = 1000;
const LOW_CONFIDENCE_BANK_SIZE = 5;
const MAX_WINDOW_SIZE = 1024;
const WORKSPACE_ROOT = path.resolve(import.meta.dir, "../../../");
const FILE_PATH = path.join(
  WORKSPACE_ROOT,
  "corpora/brown-corpus/output/brown_unsegmented.txt"
);
const TENANT_ID = "word-segmentation";
const ITERATIONS = 20;

export const logger = pino({ name: TENANT_ID });
let highConfidenceCache = new TokenCache(
  HIGH_CONFIDENCE_BANK_SIZE,
  keyGenerators.fastHash
);
let lowConfidenceCache = new TokenCache(
  LOW_CONFIDENCE_BANK_SIZE,
  keyGenerators.fastHash
);

const sessionIds = [];

for (let i = 0; i < ITERATIONS; i++) {
  const lzst = new LZST(
    highConfidenceCache,
    lowConfidenceCache,
    MAX_WINDOW_SIZE
  );

  logger.info({ iteration: i }, "Running session");
  const { stream } = await readFile(FILE_PATH);
  const { sessionId } = await runSession({
    tenantId: TENANT_ID,
    stream,
    lzst,
  });
  sessionIds.push(sessionId);
  logger.info({ sessionId }, "Session completed");

  let oldCache = highConfidenceCache.dump();
  highConfidenceCache = new TokenCache(
    Math.floor(HIGH_CONFIDENCE_BANK_SIZE * 1.1),
    keyGenerators.fastHash
  );
  highConfidenceCache.load(oldCache);

  oldCache = lowConfidenceCache.dump();
  lowConfidenceCache = new TokenCache(
    LOW_CONFIDENCE_BANK_SIZE,
    keyGenerators.fastHash
  );
  lowConfidenceCache.load(oldCache);
}

process.exit(0);
