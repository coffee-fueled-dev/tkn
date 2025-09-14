import type { Lattice, ILatticeConfig } from "../lattice";

export interface IIngestConfig {
  batchSize?: number;
  lattice?: ILatticeConfig | Lattice;
  logProgress?: boolean;
}

/**
 * Interface for Ingest - high-performance token ingestion system
 * Buffers and batches tokens for efficient lattice storage
 */
export interface IIngest {
  /**
   * Configuration used for instantiation
   */
  readonly _config: IIngestConfig;

  /**
   * Get configuration used for instantiation
   */
  config: IIngestConfig;

  /**
   * Get the underlying lattice instance
   */
  readonly lattice: Lattice;

  /**
   * Get current ingestion statistics
   */
  readonly stats: any | null; // TODO: Define proper stats interface

  /**
   * Buffer a token (hex string). Commits when the buffer reaches batchSize
   */
  buffer(hexBytes: string): void;

  /**
   * Flush any remaining buffered tokens and finalize token degrees
   */
  flush(): void;
}
