import type { Ingest } from "@tkn/tokenizer";
import type { LZS } from "@tkn/lzs";

export async function trainTokenizer(
  lzs: LZS,
  ingest: Ingest,
  dataStream: {
    iterable: AsyncIterable<Uint8Array>;
    limit?: number;
  },
) {
  const corpusVocabulary = new Set<number>();
  let bytesProcessed = 0;

  for await (const chunk of dataStream.iterable) {
    for (const byte of chunk) {
      if (dataStream.limit && bytesProcessed >= dataStream.limit) {
        break;
      }
      bytesProcessed++;
      corpusVocabulary.add(byte);
      const token = lzs.processByte(byte);
      if (token) {
        // Await to provide natural backpressure and allow batch flushes to run.
        ingest.enqueueToken(token);
      }
    }
  }
  console.log(`  Processed ${bytesProcessed} bytes`);
  console.log(
    `  Corpus vocabulary size: ${corpusVocabulary.size} unique bytes`,
  );

  // Make sure all pending work is persisted before querying/closing.
  ingest.flush(); // push any remainder

  console.log("  All pending writes complete");

  return { bytesProcessed, corpusVocabulary };
}
