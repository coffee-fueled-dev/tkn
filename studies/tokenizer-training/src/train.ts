import { Database } from "bun:sqlite";

import { Ingest, Lattice } from "@tkn/tokenizer";
import { LZS } from "@tkn/lzs";
import { Hex, RollingHash } from "@tkn/serializers";
import { readFile } from "@tkn/studies-shared";
import { promptLoop } from "./prompt-loop";

const SQLITE_PATH = ":memory:";
const CORPUS_PATH = "../../../tools/corpora/.corpus/brown_gold_standard.txt";
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
    mode: "none",
  },
  trieSearch: {
    mode: "enabled",
  },
});

const trainingIngest = new Ingest({
  batchSize: TRANSITION_BATCH_SIZE,
  lattice,
});

const timer = performance.now();
const corpus = await readFile(CORPUS_PATH);
for await (const chunk of corpus.stream) {
  for (const byte of chunk) {
    const token = byteSequencer.processByte(byte);

    if (token) {
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
console.log("Lattice stats: ", lattice.getLatticeStats());

console.log("Training phase complete");
promptLoop(lattice);
