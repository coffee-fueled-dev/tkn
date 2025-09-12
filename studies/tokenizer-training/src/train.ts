import { Database } from "bun:sqlite";
import { stat } from "node:fs/promises";

import { Ingest, Decoder, PerplexityCalculator } from "@tkn/tokenizer";
import { LZS } from "@tkn/lzs";
import { RollingHash } from "@tkn/serializers";
import { trainTokenizer } from "./phases/train";
import { TokenCache } from "@tkn/token-cache";
import { PhaseStreamRouter } from "./phases/phase-stream-router";
import { createTrainingPhaseBoundaries } from "./phases/lib";

const SQLITE_PATH = ":memory:"; // The location the database will be written to
const CORPUS_PATH = "../../../tools/corpora/.corpus/tinystories_500.txt"; // The corpus file to ingest
const TRANSITION_BATCH_SIZE = 50_000; // 500 transitions will be sent in each database write operation
const CACHE_SIZE = 2_000; // The LRU cache in LZS can hold 2000 tokens
const INITIAL_TRUST_THRESHOLD = 3; // A token must be seen twice to be emit as a known candidate

const tokenDb = new Database(SQLITE_PATH);

const fileSize = (await stat(CORPUS_PATH)).size;

const streamParts = new PhaseStreamRouter(
  CORPUS_PATH,
  createTrainingPhaseBoundaries(
    fileSize,
    0.8, // End of training phase
    0.9, // End of dev phase -- tune hyperparameters like Alpha (used for lapache smoothing by the perplexity calculator)
    1, // End of validation phase
  ),
  fileSize,
);

// Shared token cache to keep the various components in sync
const tokenCache = new TokenCache(CACHE_SIZE);

// Lemple-Ziv Sequencer used to merge and sequence patterns from the input stream
const lzs = new LZS({
  keyGenerator: new RollingHash(),
  cache: { strategy: tokenCache },
  trustThreshold: INITIAL_TRUST_THRESHOLD,
});

const trainingIngest = new Ingest({
  batchSize: TRANSITION_BATCH_SIZE,
  database: { instance: tokenDb },
  cache: { strategy: tokenCache },
});
trainingIngest.init(); // Setup tables and prepare statements -- this must be called first so the tables exist

const decoder = new Decoder({ database: { instance: tokenDb } });

const perplexityCalculator = new PerplexityCalculator({
  corpusVocabSize: undefined,
  database: { instance: tokenDb },
});

// Handle the initial training phase of corpus ingestion
const { corpusVocabulary, bytesProcessed } = await trainTokenizer(
  lzs,
  trainingIngest,
  {
    iterable: streamParts.train(),
  },
);
perplexityCalculator.setCorpusVocabSize(corpusVocabulary.size);

console.log("Training phase complete");
console.log("Bytes processed:", bytesProcessed);
console.log("Corpus vocabulary size:", corpusVocabulary.size);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const bytes = [...textEncoder.encode("Once upon a time")];
const tokenized = decoder.decode(bytes);

console.log(
  tokenized.map((token) => textDecoder.decode(new Uint8Array(token))),
);

console.log(
  "Perplexity: ",
  perplexityCalculator.compute(tokenized, { alpha: 0.17 }),
);

// Handle hyperparameter tuning

// const tokenizedParagraphs = await tokenizeParagraphs(tokenizer, {
//   iterable: streamParts.dev(),
// });
// const decoder = new TextDecoder();
// tokenizedParagraphs.map((p) => console.log(toSegmentedString(p, decoder)));

// const { alpha } = await tuneAlpha(tokenizedParagraphs, calculator);

// console.log("Tuned alpha for Lapache smoothing: ", alpha);

// // Handle the final validation phase
// while (streamed >= PHASE_BOUNDARIES_BYTES[2]) {
//   calculator.setCorpusVocabSize(trainingVocabularySize);
//   // Not entirely sure how to validate here, but we have 10% of the corpus left and know our alpha value
// }

trainingIngest.close(); // close the database connection
tokenDb.close(); // close the database connection
// await calculator.close(); // close the database connection
// await tokenizer.close(); // close the database connection
