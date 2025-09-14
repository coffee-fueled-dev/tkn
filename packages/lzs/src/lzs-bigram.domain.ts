import type { ILZS } from "./lzs.domain";

/**
 * Interface for LZSBigram - a wrapper around LZS that reprocesses tokens
 * that were emitted by a byte-level LZS into chunk-level tokens
 */
export interface ILZSBigram extends ILZS {
  // Inherits all ILZS methods and properties
  // Additional methods specific to bigram processing could be added here
}
