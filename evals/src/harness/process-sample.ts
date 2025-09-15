import { Lattice, Tokenizer, type ITokenizerStats } from "@tkn/tokenizer";

export interface SampleConfig {
  content: string;
  tokenizer?: Tokenizer;
  lattice?: Lattice;
  metadata?: Record<string, string>;
}

export interface SampleResult {
  content: string;
  tokens: number[];
  strings: string[];
  tokenizerStats: ITokenizerStats | null;
  metadata?: Record<string, string>;
}

export function processSample({
  content,
  tokenizer,
  lattice,
  metadata,
}: SampleConfig): SampleResult {
  const _tokenizer =
    tokenizer ??
    new Tokenizer({
      lattice,
      monitor: { mode: "extended" },
    });

  const tokens = _tokenizer.decode(content);
  const strings = _tokenizer.toStrings(tokens);
  const tokenizerStats = _tokenizer.stats;

  const result: SampleResult = {
    content,
    tokens,
    strings,
    tokenizerStats,
    metadata,
  };
  return result;
}
