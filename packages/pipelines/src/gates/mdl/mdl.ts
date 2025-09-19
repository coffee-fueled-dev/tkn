import type {
  IEmissionGate,
  IEmissionGateEvaluateFn,
  IEmissionGateSnapshotFn,
  IEmissionGateConfig,
  Key,
} from "@tkn/sequencer";
import { FastMarkovStats } from "./stats-provider";

/** Stats provider required by this MDL gate */
export interface MDLStatsProvider {
  parentCount(prev: Key): number; // denominator 'c'
  edgeCount(prev: Key, current: Key): number; // numerator 'r'
  degree(prev: Key): number; // branching factor
  push(prev: Key, current: Key): void; // ingest adjacency
}

export interface MDLGateConfig extends IEmissionGateConfig {
  name?: string;
  alpha?: number; // Laplace smoothing
  beta?: number; // EWMA step
  c?: number; // relative-surprise slack (stdevs)
  tau?: number; // entropy exponent
  zMode?: "child-degree" | "fixed";
  zFixed?: number;
  maxDegreeTable?: number;
  stats?: MDLStatsProvider; // defaults to new FastMarkovStats()
}

/** Tiny metrics (no monitor object on hot path) */
export type MDLCustomMetrics = {
  ewmaP: number;
  variance: number;
};

export class MDLGate implements IEmissionGate<MDLCustomMetrics> {
  // --- config ---
  private readonly _name: string;
  private readonly _alpha: number;
  private readonly _beta: number;
  private readonly _c: number;
  private readonly _tau: number;
  private readonly _zMode: "child-degree" | "fixed";
  private readonly _zFixed: number;
  private _stats: MDLStatsProvider;

  // --- derived constants ---
  private readonly _oneMinusBeta: number;
  private readonly _c2: number;

  // --- EWMA state ---
  private _ewmaP = 0.2;
  private _ewmaP2 = 0.08;

  // --- degree threshold table: thr[d] = d^{-tau}; thr[0] = 0 ---
  private _thr!: Float64Array;
  private _thrMax = 0;

  // --- lightweight counters (for snapshot only) ---
  private _ingested = 0;
  private _pass = 0;

  constructor({
    name,
    alpha = 0.1,
    beta = 0.02,
    c = 0.7,
    tau = 0.8,
    zMode = "child-degree",
    zFixed = 256,
    maxDegreeTable = 2048,
    stats,
  }: MDLGateConfig = {}) {
    this._name = name ?? "MDLGate";
    this._alpha = alpha;
    this._beta = beta;
    this._c = c;
    this._tau = tau;
    this._zMode = zMode;
    this._zFixed = zFixed | 0;
    this._stats =
      stats ?? (new FastMarkovStats() as unknown as MDLStatsProvider);

    this._oneMinusBeta = 1 - this._beta;
    this._c2 = this._c * this._c;

    this._initThr(maxDegreeTable > 1 ? maxDegreeTable | 0 : 2048);
  }

  /** Hot path: uses counts up to t-1; ingests (prev->cur) after deciding. */
  evaluate: IEmissionGateEvaluateFn = (
    current: Key,
    previous: Key
  ): boolean => {
    // --- degree (raw) ---
    const degreeRaw =
      this._zMode === "child-degree"
        ? this._stats.degree(previous) | 0
        : this._zFixed | 0;

    // denominator guard: >=1 to keep Laplace stable
    const Zprob = degreeRaw > 0 ? degreeRaw : 1;

    // counts BEFORE ingesting this edge
    const cParent = this._stats.parentCount(previous) | 0;
    const rEdge = this._stats.edgeCount(previous, current) | 0;

    // conditional p (unclamped for entropy)
    const denom = cParent + this._alpha * Zprob;
    const pRaw = denom > 0 ? (rEdge + this._alpha) / denom : 1 / Zprob;

    // stable copy for EWMA
    let pForEWMA = pRaw;
    if (pForEWMA <= 0) pForEWMA = Number.EPSILON;
    else if (pForEWMA >= 1) pForEWMA = 1 - 1e-12;

    // EWMA update
    const meanPrev = this._ewmaP;
    const p2 = pForEWMA * pForEWMA;
    this._ewmaP = this._oneMinusBeta * this._ewmaP + this._beta * pForEWMA;
    this._ewmaP2 = this._oneMinusBeta * this._ewmaP2 + this._beta * p2;

    // variance (clamped)
    const varP = this._ewmaP2 - this._ewmaP * this._ewmaP;

    // tests
    const diff = meanPrev - pForEWMA;
    const passRelative =
      diff > 0 && diff * diff >= this._c2 * (varP > 0 ? varP : 1e-12);

    // Entropy scaling: degree 0 gets threshold 0 (always passes entropy)
    const zClamped = degreeRaw <= this._thrMax ? degreeRaw : this._thrMax;
    const thr = this._thr[zClamped]; // _thr[0] = 0, so degree 0 always passes
    const passEntropy = pRaw >= thr - 1e-12;

    const ok = passRelative && passEntropy;

    // ingest AFTER deciding so this event informs t+1
    this._stats.push(previous, current);

    // light counters
    this._ingested++;
    if (ok) this._pass++;

    return ok;
  };

  reset = (): void => {
    this._ewmaP = 0.2;
    this._ewmaP2 = 0.08;
    this._ingested = 0;
    this._pass = 0;
  };

  snapshot: IEmissionGateSnapshotFn<MDLCustomMetrics> = async () => {
    const total = this._ingested || 1;
    const passRate = this._pass / total;
    const variance = this._ewmaP2 - this._ewmaP * this._ewmaP;

    return {
      name: this._name,
      ingested: this._ingested,
      passRate,
      customMetrics: {
        ewmaP: this._ewmaP,
        variance: variance > 0 ? variance : 0,
      },
    };
  };

  // ---- internals ----
  private _initThr(maxDeg: number): void {
    const tbl = new Float64Array(maxDeg + 1);
    tbl[0] = 0; // degree==0 ⇒ entropy auto-pass
    const tau = this._tau;
    for (let d = 1; d <= maxDeg; d++) tbl[d] = Math.pow(d, -tau);
    this._thr = tbl;
    this._thrMax = maxDeg;
  }

  // Optional: expose config
  get config() {
    return {
      name: this._name,
      alpha: this._alpha,
      beta: this._beta,
      c: this._c,
      tau: this._tau,
      zMode: this._zMode,
      zFixed: this._zFixed,
      maxDegreeTable: this._thrMax,
    };
  }
}
