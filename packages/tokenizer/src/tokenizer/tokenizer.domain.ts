import type {
  ITokenizerMonitorConfig,
  ITokenizerStats,
} from "./monitor.domain";
import type { ILatticeConfig, Lattice } from "../lattice";
import type { TokenizerMonitor } from "./monitor";

export interface ITokenizerConfig {
  lattice?: ILatticeConfig | Lattice;
  monitor?: TokenizerMonitor | ITokenizerMonitorConfig | false;
  beta?: number; // weight for log(strength+1)
  gamma?: number; // weight for log(outdegree+1)
}

export interface ITokenizer {
  /**
   * Get UTF-8 bytes from token ID
   */
  getTokenBytes(tokenId: number): number[] | null;

  /**
   * Decode input string to token IDs using hybrid greedy/Viterbi approach
   */
  decode(input: string): number[];

  /**
   * Convert token IDs to their string representations
   */
  toStrings(tokenIds: number[]): string[];

  /**
   * Get current tokenizer statistics
   */
  readonly stats: ITokenizerStats | null;
}
