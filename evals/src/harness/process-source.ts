import { LZS, type ILZSConfig } from "@tkn/lzs";
import {
  Ingest,
  Lattice,
  Tokenizer,
  type IIngestConfig,
  type ITokenizerStats,
} from "@tkn/tokenizer";
import { Hex, UnicodeReader } from "@tkn/serializers";

export interface Source {
  [Symbol.asyncIterator](): AsyncGenerator<number[], void, unknown>;
}

export interface ProcessSourceConfig {
  source: Source;
  logProgress?: boolean;
  logSequences?: boolean;
  lzs?: ILZSConfig | LZS;
  ingest?: IIngestConfig | Ingest | false; // Optionally supply an ingest or config to train the tokenizer, otherwise this is a dry run of the LZS
}

export interface SourceResult {
  lzs: LZS["stats"];
  lattice: Lattice["stats"];
}

export interface ProcessSampleConfig {
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
}: ProcessSampleConfig): SampleResult {
  const _tokenizer =
    tokenizer ??
    new Tokenizer({
      lattice,
      monitor: { mode: "extended" },
    });

  const tokens = _tokenizer.decode(content);
  const strings = _tokenizer.toStrings(tokens);
  const tokenizerStats = _tokenizer.stats;

  return {
    content,
    tokens,
    strings,
    tokenizerStats,
    metadata,
  };
}

export async function processSource({
  source,
  logProgress = false,
  logSequences = false,
  lzs,
  ingest,
}: ProcessSourceConfig): Promise<SourceResult & { ingest?: Ingest }> {
  const _lzs = lzs instanceof LZS ? lzs : new LZS(lzs);

  const _ingest =
    ingest === false
      ? undefined
      : ingest instanceof Ingest
      ? ingest
      : new Ingest(ingest);

  try {
    let processedCodepoints = 0;

    for await (const chunk of source) {
      for (const codepoint of chunk) {
        const sequence = _lzs.processByte(codepoint);
        if (logProgress) processedCodepoints++;

        if (sequence) {
          if (logSequences) {
            console.log(`${UnicodeReader.codepointsToString(sequence)}`);
          }
          if (_ingest) {
            _ingest.buffer(
              Hex.fromBytes(UnicodeReader.codepointsToUtf8Bytes(sequence))
            );
          }
        }

        if (logProgress && processedCodepoints % 10000 === 0) {
          process.stdout.write(
            `\r📈 Processed ${processedCodepoints} codepoints`
          );
        }
      }
    }

    if (_ingest) _ingest.flush();

    const result: SourceResult = {
      lzs: _lzs.stats ?? null,
      lattice: _ingest?.stats ?? null,
    };

    return { ...result, ingest: _ingest };
  } catch (error) {
    throw error;
  }
}
