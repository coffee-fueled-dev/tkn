import { MergeSequencer, BoundarySequencer, IntSequencer } from "./sequencers";
import { LZGate, type LZGateConfig } from "./gates";
import { JobRunner } from "./job-runner";
import { LRUCache } from "lru-cache";
import { Lattice } from "@tkn/lattice";

export * from "./gates";
export * from "./job-runner";

const sharedCache = new LRUCache({ max: 70_000 });

export const DEFAULT_LZ_GATE_CONFIG: LZGateConfig = {
  cache: sharedCache,
};

const lzGateFactory = (config: LZGateConfig) => new LZGate(config);

export const defaultIntSequencer = new IntSequencer({
  gates: [lzGateFactory(DEFAULT_LZ_GATE_CONFIG)],
});

export const defaultBoundarySequencer = new BoundarySequencer({
  gates: [lzGateFactory(DEFAULT_LZ_GATE_CONFIG)],
  innerSequencer: defaultIntSequencer,
});

export const defaultMergeSequencer = new MergeSequencer({
  gates: [lzGateFactory(DEFAULT_LZ_GATE_CONFIG)],
  innerSequencer: defaultBoundarySequencer,
});

export const defaultJobRunner = new JobRunner({
  sequencer: defaultMergeSequencer,
  lattice: new Lattice(),
  logProgress: true,
  logSequences: false, // This would be extremely noisy if true
  meta: {
    name: "defaultJobRunner",
  },
});
