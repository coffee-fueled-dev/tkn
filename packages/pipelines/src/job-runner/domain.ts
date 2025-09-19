import type { SourceResult, Source } from "./process-source";
import type { BunFile } from "bun";
import type { ISequencer, ISequencerConfig } from "@tkn/sequencer";
import type { Lattice } from "@tkn/lattice";

export type Metadata = Record<string, string | number>;

export interface JobData {
  runnerId: string;
  jobId?: string;
  createdAt?: string; // DateTime
  processStartMS?: number; // nanosecond timestamp
  durationMS?: number | "incomplete"; // nanosecond timestamp
  jobMeta?: JobConfig["meta"];
  runnerMeta?: RunnerConfig["meta"];
  sourceSize?: number | "unknown" | "infinite";
  mbSec?: number | "unknown" | "infinite"; // codepoints per second
}

export interface JobConfig {
  source: Source | BunFile;
  runnerConfig?: RunnerConfig;
  meta?: Metadata;
}

export interface RunnerConfig {
  lattice?: Lattice;
  sequencer?: ISequencerConfig | ISequencer;
  logSequences?: boolean;
  logProgress?: boolean;
  meta?: Metadata;
}

export interface JobResult {
  sourceResult: SourceResult;
  jobData?: JobData;
}

export interface IJobRunner {
  run(config: JobConfig): Promise<JobResult>;
  config: RunnerConfig;
  lattice: Lattice | undefined;
}
