export interface ILattice {
  /**
   * Merge an edge with optional additive weight (defaults to +1).
   */
  merge(origin: number[], terminal: number[], weight?: number): void;

  /**
   * Decode an input sequence to tokens.
   */
  tokens(sequence: number[]): bigint[];
  tokens(sequence: number[], as: "ids"): bigint[];
  tokens(sequence: number[], as: "sequences"): number[][];

  /**
   * Convert token IDs to their codepoint sequences.
   */
  ints(tokens: bigint[]): number[][];
}
