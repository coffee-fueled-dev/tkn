import { Lattice, type Pair, type Token } from "../lattice";
import type { IIngest, IIngestConfig } from "./ingest.domain";

export class Ingest implements IIngest {
  readonly _config: IIngestConfig;
  private _lattice: Lattice;
  private readonly _batchSize: number;
  private _tokenBuffer: string[] = [];
  private _logProgress?: boolean;

  constructor(config: IIngestConfig = {}) {
    this._config = config;
    const { batchSize = 1000, lattice, logProgress = false } = config;
    this._lattice = lattice instanceof Lattice ? lattice : new Lattice(lattice);
    this._batchSize = Math.max(1, batchSize);
    this._logProgress = logProgress;
  }

  /** Buffer a token (hex string). Commits when the buffer reaches batchSize. */
  buffer(hexBytes: string): void {
    this._tokenBuffer.push(hexBytes);
    if (this._tokenBuffer.length >= this._batchSize) {
      this.commitBatchOf(this._batchSize);
    }
  }

  /** Commit up to `size` buffered tokens, letting SQL handle all aggregation. */
  private commitBatchOf(size: number = this._batchSize): void {
    const batch = this._tokenBuffer.splice(0, size);
    if (batch.length === 0) return;

    // Generate all tokens (each token occurrence gets degree=0, strength=1)
    const tokenOccurrences: Array<Omit<Token, "id">> = batch.map((bytes) => ({
      bytes,
      degree: 0,
      strength: 1,
    }));

    // Generate all edges with proper weight aggregation within the batch
    const edgeMap = new Map<string, number>();
    for (let i = 0; i + 1 < batch.length; i++) {
      const edgeKey = `${batch[i]}|${batch[i + 1]}`;
      edgeMap.set(edgeKey, (edgeMap.get(edgeKey) ?? 0) + 1);
    }

    // Convert map to edge occurrences with aggregated weights
    const edgeOccurrences: Pair[] = [];
    for (const [edgeKey, weight] of edgeMap) {
      const [from, to] = edgeKey.split("|");
      edgeOccurrences.push({ from, to, weight });
    }

    if (this._logProgress) {
      console.log(
        `Committing ${tokenOccurrences.length} token occurrences and ${edgeOccurrences.length} edge occurrences...`
      );
    }
    this._lattice.batchIngest(tokenOccurrences, edgeOccurrences);
  }

  /** Force a commit of any buffered tokens and finalize degrees. */
  flush(): void {
    if (this._tokenBuffer.length) {
      this.commitBatchOf(this._tokenBuffer.length);
    }

    // Update all token degrees once at the end
    console.log("Finalizing token degrees...");
    this._lattice.updateTokenDegrees();
  }

  get lattice(): Lattice {
    return this._lattice;
  }

  get stats(): Lattice["stats"] {
    return this._lattice.stats;
  }

  get config(): IIngestConfig {
    return this._config;
  }
}
