import type { Key } from "./sequencer.domain";

export type IEmissionGateSnapshotFn<
  TCustomMetrics extends Record<string, number> = Record<string, number>
> = () => Promise<IEmissionGateSnapshot<TCustomMetrics>>;
export interface IEmissionGateSnapshot<
  TCustomMetrics extends Record<string, number> = Record<string, number>
> {
  /** The name of the gate */
  name: string;
  /** Number of ints processed */
  ingested: number;
  /** Pass rate of the gate */
  passRate: number;
  /** Custom metrics */
  customMetrics?: TCustomMetrics;
}

export type IEmissionGatePushFn = (int: number) => void;
export type IEmissionGateEvaluateFn = (current: Key, previous: Key) => boolean;
export type IEmissionGateResetFn = () => void;

export interface IEmissionGateConfig {
  name?: string;
}

export interface IEmissionGate<
  TCustomMetrics extends Record<string, number> = Record<string, number>
> {
  /** Evaluates the current state of the gate
   * @returns true if the pattern should continue extending, false if it should emit the last known pattern
   */
  evaluate: IEmissionGateEvaluateFn;
  /** Resets the gate state */
  reset: IEmissionGateResetFn;
  /** Gets the current state of the gate */
  readonly snapshot: IEmissionGateSnapshotFn<TCustomMetrics>;
}

export function isIEmissionGate(obj: unknown): obj is IEmissionGate {
  if (typeof obj !== "object" || obj === null) return false;
  const gate = obj as IEmissionGate;
  return (
    typeof gate.evaluate === "function" &&
    typeof gate.reset === "function" &&
    typeof gate.snapshot === "function"
  );
}
