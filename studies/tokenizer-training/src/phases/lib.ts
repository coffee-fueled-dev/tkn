import {
  LatticeTokenizer,
  PerplexityCalculator,
  type PerplexityResult,
} from "@tkn/lattice-tokenizer";

export const createTrainingPhaseBoundaries = (
  fileSize: number,
  ...pctBoundaries: number[]
) =>
  pctBoundaries.map((pct) => Math.floor(fileSize * pct)) as [
    number,
    number,
    number
  ];

export async function tokenizeText(
  text: string,
  textEncoder: TextEncoder,
  tokenizer: LatticeTokenizer
): Promise<number[][]> {
  const inputBytes = Array.from(textEncoder.encode(text));
  const tokens = await tokenizer.tokenize(inputBytes);
  return tokens;
}

export async function calculatePerplexity(
  tokens: number[][],
  calculator: PerplexityCalculator,
  alpha: number
): Promise<PerplexityResult> {
  const perplexity = await calculator.compute(tokens, { alpha });
  return perplexity;
}

export function toSegmentedString(
  tokens: number[][],
  textDecoder: TextDecoder
): string {
  const decodedTokens = tokens.map((tok) =>
    textDecoder.decode(new Uint8Array(tok))
  );
  return decodedTokens.join("|");
}
