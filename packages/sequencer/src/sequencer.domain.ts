import {
  isIEmissionGate,
  type IEmissionGate,
  type IEmissionGateSnapshot,
} from "./emission-gate.domain";
import type {
  IKeyGenerator,
  IKeyGeneratorConfig,
} from "./key-generator.domain";

export type Key = number; // Signed integer

export interface ITransform {
  transform: (int: number) => number;
}

export interface ISequencerConfig<
  TEmissionGates extends IEmissionGate[] = IEmissionGate[]
> {
  name?: string;
  gates: TEmissionGates;
  keyGenerator?: IKeyGenerator | IKeyGeneratorConfig;
}

export interface ISequencerSnapshot {
  name: string;
  intsIn: number;
  sequencesEmitted: number;
  intsPerEmit: number;
  durationMS: number;
  gates: IEmissionGateSnapshot[];
}

export interface ISequencer {
  /**
   * The emission gates used to determine if a sequence should be emitted
   */
  readonly _emissionGates: IEmissionGate[];

  /**
   * Processes a single int and returns the longest known subsequence if found
   * @param int The int to process
   * @returns Hex ints string of the longest known subsequence, or null if pattern continues
   */
  push(int: number): number[] | void;

  /**
   * Flushes the current state
   * @returns The currently buffered sequences
   */
  flush(): number[][];

  /**
   * Resets all internal state
   */
  reset(): void;

  /**
   * @returns A snapshot of the internal state
   */
  snapshot(): Promise<ISequencerSnapshot[]>;

  bytesIn: number;
  sequencesEmitted: number;
  intsPerEmit: number;
  durationMS: number;
}

export const isISequencer = (obj: unknown): obj is ISequencer => {
  if (typeof obj !== "object" || obj === null) return false;
  const sequencer = obj as ISequencer;
  return (
    typeof sequencer.push === "function" &&
    typeof sequencer.flush === "function" &&
    typeof sequencer.reset === "function" &&
    typeof sequencer.snapshot === "function" &&
    typeof sequencer._emissionGates === "object" &&
    sequencer._emissionGates.every(isIEmissionGate)
  );
};
