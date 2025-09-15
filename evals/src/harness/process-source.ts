import { LZS, type ILZSConfig } from "@tkn/lzs";
import { Ingest, Lattice, type IIngestConfig } from "@tkn/tokenizer";
import { Hex, Unicode } from "@tkn/serializers";

export interface Source {
  [Symbol.asyncIterator](): AsyncGenerator<number[], void, unknown>;
}

export interface SourceConfig {
  source: Source;
  logProgress?: boolean;
  logSequences?: boolean;
  lzs?: ILZSConfig | LZS;
  ingest?: IIngestConfig | Ingest | false; // False will do a dry run of the LZS
}

export interface SourceResult {
  lzs: LZS["stats"];
  lattice: Lattice["stats"];
}
export async function processSource({
  source,
  logProgress = false,
  logSequences = false,
  lzs,
  ingest,
}: SourceConfig): Promise<SourceResult & { ingest?: Ingest }> {
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
        const sequence = _lzs.push(codepoint);
        if (logProgress) processedCodepoints++;

        if (sequence) {
          if (logSequences) {
            console.log(`${Unicode.toString(sequence)}`);
          }
          if (_ingest) {
            _ingest.buffer(Hex.fromBytes(Unicode.toUtf8Bytes(sequence)));
          }
        }

        if (logProgress && processedCodepoints % 10000 === 0) {
          process.stdout.write(
            `\r📈 Processed ${processedCodepoints} codepoints`
          );
        }
      }
    }

    const buffered = _lzs.flush();

    if (buffered.current) {
      for (const token of buffered.current) {
        if (_ingest) _ingest.buffer(Hex.fromBytes(token));
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
