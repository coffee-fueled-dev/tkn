import { Database } from "bun:sqlite";

import type {
  IIngestConfig,
  ILatticeConfig,
  Ingest,
  Lattice,
  PerplexityResult,
} from "@tkn/tokenizer";
import { type ProcessResult, type Source } from "./process-source";
import type { BunFile } from "bun";
import type { ILZSConfig, LZS } from "@tkn/lzs";
import { RollingHash } from "@tkn/serializers";

export interface Sample {
  content: string;
  metadata?: Record<string, string>;
}

export interface JobConfig {
  source: Source | BunFile;
  samples: Sample[];
  metadata?: Record<string, string>;
  trainingConfig: TrainingConfig;
}

export interface TrainingConfig {
  lzs?: ILZSConfig | LZS;
  lattice?: ILatticeConfig | Lattice;
  ingest?: IIngestConfig | Ingest;
  showProgress?: boolean;
  logTokens?: boolean;
  logSequences?: boolean;
}

export interface JobResult {
  training: ProcessResult;
  evaluations: SampleResult[];
  avgTokensPerSample: number;
  totalSamples: number;
  trainingConfig: TrainingConfig;
  metadata?: JobConfig["metadata"];
}

export interface SampleResult {
  content: Sample["content"];
  tokens: number[];
  strings: string[];
  stats: PerplexityResult;
  metadata?: Sample["metadata"];
}

export const DEFAULT_CONFIG: TrainingConfig = {
  lzs: {
    cache: { size: 70_000 },
    trustThreshold: 1,
    stats: { mode: "extended" },
    trieSearch: { mode: "enabled" },
    mdl: {
      alpha: 0.1,
      zMode: "child-degree",
      beta: 0.02,
      c: 0.7,
      tau: 0.8,
    },
  },
  lattice: {}, // Default lattice config - creates in-memory database
  ingest: { batchSize: 70_000 },

  showProgress: true,
  logTokens: false,
  logSequences: false,
};

export interface JobRunner {
  run(config: JobConfig): Promise<JobResult>;
}
