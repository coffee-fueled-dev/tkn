import { accumulateBytes } from "../../../shared/src/accumulate-bytes";
import type {
  LatticeTokenizer,
  PerplexityCalculator,
} from "@tkn/lattice-tokenizer";
import { goldenSectionSearch } from "../../../shared/src/golden-section-search";

export async function tokenizeParagraphs(
  tokenizer: LatticeTokenizer,
  dataStream: {
    iterable: AsyncIterable<Uint8Array>;
    limit?: number;
  }
) {
  const tokenizationResults: Promise<number[][]>[] = [];

  // Accumulate until we hit the limit, or end of stream if no limit is set
  await accumulateBytes(dataStream, {
    maxBytes: 16 * 1024, // size-based flush
    maxIdleMs: 250, // time-based flush
    asUint8Array: true, // always Uint8Array

    // Tokenize the flushed data and queue the result
    onFlush: (data) =>
      data.length > 1
        ? void tokenizationResults.push(tokenizer.tokenize([...data]))
        : void 0,
  });

  return await Promise.all(tokenizationResults);
}

export async function tuneAlpha(
  tokenizationResults: number[][][],
  calculator: PerplexityCalculator
) {
  const { x: alpha } = await goldenSectionSearch(0.01, 1.0, async (alpha) => {
    let totalSumLog = 0;
    let totalTransitions = 0;
    for (const tokens of tokenizationResults) {
      const { sumLog, transitions, perplexity } = await calculator.compute(
        tokens,
        { alpha }
      );
      totalSumLog += sumLog;
      totalTransitions += transitions;
    }
    const ppl = Math.exp(-(totalSumLog / totalTransitions));

    console.log(
      `         alpha=${alpha.toFixed(4)} => weighted avg perplexity=${ppl}`
    );
    return ppl; // minimization objective
  });

  return { alpha };
}
