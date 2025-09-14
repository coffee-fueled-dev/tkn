import type { IIngestConfig, Ingest, PerplexityResult } from "@tkn/tokenizer";
import type { ProcessResult, Source } from "./process-source";
import type { BunFile } from "bun";
import type { ILZSConfig, LZS } from "@tkn/lzs";
import { ByteTrie } from "../../../packages/lzs/src/byte-trie";

export interface Sample {
  content: string;
  metadata?: Record<string, string>;
}

export interface JobProcessMetadata {
  id: string;
  createdAt: string; // DateTime
  duration?: number | "incomplete"; // nanosecond timestamp
}

export interface JobConfig {
  source: Source | BunFile;
  metadata?: Record<string, string>;
  process: JobProcessMetadata;
  trainingConfig: TrainingConfig;
  sampleConfig: SampleConfig;
}

export interface SampleConfig {
  run: boolean; // Whether to run the samples through the tokenizer
  samples?: Sample[];
  logTokens?: boolean;
  logProgress?: boolean;
}

export interface TrainingConfig {
  lzs?: ILZSConfig | LZS;
  ingest?: IIngestConfig | Ingest | false;
  logSequences?: boolean;
  logProgress?: boolean;
}

export interface JobResult {
  training: ProcessResult;
  metadata?: JobConfig["metadata"];
  process: JobConfig["process"];
  samples?: {
    results: SampleResult[];
    total: number;
    avgTokensPerSample: number;
  };
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
    stats: { mode: "extended" },
    trie: new ByteTrie(),
    mdl: {
      alpha: 0.1,
      zMode: "child-degree",
      beta: 0.02,
      c: 0.7,
      tau: 0.8,
    },
  },
  ingest: { batchSize: 70_000 },

  logProgress: true,
  logSequences: false,
};

export interface IJobRunner {
  run(config: JobConfig): Promise<JobResult>;
}

export const jobProcessMetadata = (): JobProcessMetadata => ({
  id: Bun.randomUUIDv7("hex"),
  createdAt: new Date(Date.now()).toISOString(),
  duration: "incomplete",
});
