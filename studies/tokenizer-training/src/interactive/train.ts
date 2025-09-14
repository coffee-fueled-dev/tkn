import { Database } from "bun:sqlite";

import { Ingest, Lattice } from "@tkn/tokenizer";
import { LZS } from "@tkn/lzs";
import { Hex, RollingHash, UnicodeReader } from "@tkn/serializers";
import { promptLoop } from "./prompt-loop";

const SQLITE_PATH = ":memory:";
const CORPUS_PATH = "../../../tools/corpora/.corpus/tinystories_1000.txt";
const TRANSITION_BATCH_SIZE = 70_000;
const CACHE_SIZE = 70_000;
const INITIAL_TRUST_THRESHOLD = 2;

const tokenDb = new Database(SQLITE_PATH);

const lattice = new Lattice({ database: { instance: tokenDb } });

const byteSequencer = new LZS({
  keyGenerator: new RollingHash(),
  cache: { size: CACHE_SIZE },
  trustThreshold: INITIAL_TRUST_THRESHOLD,
  stats: {
    mode: "none", // Enable to see MDL stats
  },
  trieSearch: {
    mode: "enabled",
  },
  mdl: {
    alpha: 0.1, // Laplace smoothing
    zMode: "child-degree", // Use trie context
    beta: 0.02, // EWMA decay rate
    c: 0.7, // Surprise tolerance
    tau: 0.8, // Entropy scaling
  },
});

const trainingIngest = new Ingest({
  batchSize: TRANSITION_BATCH_SIZE,
  lattice,
});

const timer = performance.now();
const corpus = await UnicodeReader.readFileAsCodepoints(CORPUS_PATH);
for await (const chunk of corpus.stream) {
  for (const codepoint of chunk) {
    const token = byteSequencer.processByte(codepoint);

    if (token) {
      // Convert codepoints back to string for debugging
      // console.log(UnicodeReader.codepointsToString(token));
      trainingIngest.buffer(Hex.fromBytes(token));
    }
  }
}

trainingIngest.flush();

console.log("Corpus size: ", corpus.size);
console.log(
  "Throughput (MB/s): ",
  (corpus.size * 0.000001) / ((performance.now() - timer) / 1000)
);
console.log("Byte sequence stats: ", byteSequencer.stats);
console.log("Lattice stats: ", lattice.stats);

console.log("Training phase complete");
promptLoop(lattice);
