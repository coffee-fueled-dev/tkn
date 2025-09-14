import { LZS, type ILZSConfig } from "@tkn/lzs";
import { Ingest, Lattice, type ILatticeConfig } from "@tkn/tokenizer";
import { Hex, UnicodeReader } from "@tkn/serializers";

export interface Source {
  [Symbol.asyncIterator](): AsyncGenerator<number[], void, unknown>;
}

export interface ProcessSourceConfig {
  source: Source;
  showProgress?: boolean;
  logSequences?: boolean;
  logTokens?: boolean;
  lzs?: ILZSConfig | LZS;
  lattice?: ILatticeConfig | Lattice; // Optionally supply a lattice or config to train the tokenizer, otherwise this is a dry run of the LZS
}

export interface ProcessResult {
  lzsStats: LZS["stats"];
  latticeStats: Lattice["stats"];
  lzs: LZS;
  lattice: Lattice | undefined;
}

export async function processSource({
  source,
  showProgress = false,
  logSequences = false,
  lzs,
  lattice,
}: ProcessSourceConfig): Promise<ProcessResult> {
  const _lattice = lattice
    ? lattice instanceof Lattice
      ? lattice
      : new Lattice(lattice)
    : undefined;
  const _lzs = lzs instanceof LZS ? lzs : new LZS(lzs);
  const _ingest = _lattice ? new Ingest({ lattice: _lattice }) : undefined;

  try {
    let processedCodepoints = 0;

    for await (const chunk of source) {
      for (const codepoint of chunk) {
        const token = _lzs.processByte(codepoint);
        if (showProgress) processedCodepoints++;

        if (token) {
          if (logSequences) {
            console.log(`Token: ${UnicodeReader.codepointsToString(token)}`);
          }
          if (_ingest) {
            // Convert Unicode codepoints to UTF-8 bytes before hex encoding
            const utf8Bytes = UnicodeReader.codepointsToUtf8Bytes(token);
            _ingest.buffer(Hex.fromBytes(utf8Bytes));
          }
        }

        if (showProgress && processedCodepoints % 10000 === 0) {
          process.stdout.write(
            `\r📈 Processed ${processedCodepoints} codepoints`
          );
        }
      }
    }

    if (_ingest) _ingest.flush();

    if (showProgress) {
      console.log(); // New line after progress
    }

    const result: ProcessResult = {
      lzsStats: _lzs.stats ?? null,
      latticeStats: _lattice?.stats ?? null,
      lzs: _lzs,
      lattice: _lattice,
    };

    return result;
  } catch (error) {
    throw error;
  }
}
