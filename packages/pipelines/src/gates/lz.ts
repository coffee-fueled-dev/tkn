import type {
  IEmissionGate,
  IEmissionGateConfig,
  IEmissionGateEvaluateFn,
  IEmissionGateSnapshotFn,
} from "@tkn/sequencer";
import { LRUCache } from "lru-cache";

export interface LZGateConfig extends IEmissionGateConfig {
  name?: string;
  cache: LRUCache<number, number> | { max: number };
}

export type LZCustomMetrics = {
  cacheUtilization: number;
};

export class LZGate implements IEmissionGate<LZCustomMetrics> {
  _name: string;
  _cache: LRUCache<number, number>;

  private _ingested = 0;
  private _pass = 0;

  constructor({ name = "LZGate", cache }: LZGateConfig) {
    this._name = name ?? this.constructor.name;
    this._cache = cache instanceof LRUCache ? cache : new LRUCache(cache);
  }

  // Simple LZ-style inclusion heuristic
  // We could store boolean instead of counts as a micro optimization
  // We may want to more intelligently merge later based on frequency, though
  evaluate: IEmissionGateEvaluateFn = (current) => {
    this._ingested++;
    const strength = this._cache.get(current) ?? 0;
    this._cache.set(current, strength + 1);
    if (strength >= 1) {
      this._pass++;
      return true;
    } else {
      return false;
    }
  };

  reset = (): void => {
    this._cache.clear();
    this._ingested = 0;
    this._pass = 0;
  };

  snapshot: IEmissionGateSnapshotFn<LZCustomMetrics> = async () => ({
    name: this._name,
    ingested: this._ingested,
    passRate: Number((this._pass / this._ingested).toPrecision(3)),
    customMetrics: {
      cacheUtilization: Number(
        (this._cache.size / this._cache.max).toPrecision(2)
      ),
    },
  });
}
