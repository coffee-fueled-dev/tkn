import path from "path";
import { LZST, keyGenerators } from "@tkn/core";
import { readFile } from "../shared/read-file";

const WORKSPACE_ROOT = path.resolve(import.meta.dir, "../../");
const TEST_FILE_PATH = path.join(
  WORKSPACE_ROOT,
  "corpora/brown-corpus/output/brown_gold_standard.txt"
);

const decoder = new TextDecoder("utf-8");

const lzst = new LZST({
  memorySize: 10_000,
  keyGenerator: keyGenerators.fastHash,
});

let bytesProcessed = 0;
const tokens: string[] = [];
for await (const chunk of (await readFile(TEST_FILE_PATH)).stream) {
  for (const byte of chunk) {
    bytesProcessed++;
    const token = lzst.processByte(byte);
    if (token) {
      tokens.push(decoder.decode(token));
    }
  }
}

const uniqueTokenCount = new Set(tokens).size;
console.log(
  `Raw bytes: ${bytesProcessed}, Tokens: ${
    tokens.length
  }, Unique tokens: ${uniqueTokenCount} | ${bytesProcessed / uniqueTokenCount}`
);
