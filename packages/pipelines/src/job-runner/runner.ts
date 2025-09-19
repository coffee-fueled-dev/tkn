import type { Lattice } from "@tkn/lattice";
import {
  type JobConfig,
  type JobResult,
  type IJobRunner,
  type RunnerConfig,
  type JobData,
} from "./domain";
import { isSource, processSource, type Source } from "./process-source";
import { Unicode } from "./unicode-reader";

// TODO: track token / adjacency discovery rate
export class JobRunner implements IJobRunner {
  private readonly _jobData: JobData;
  private readonly _lattice: Lattice | undefined;
  private _config: RunnerConfig;

  constructor(sharedConfig: RunnerConfig) {
    this._config = sharedConfig;
    this._jobData = {
      runnerId: Bun.randomUUIDv7("hex"),
    };
    this._lattice = sharedConfig.lattice;
  }

  async run(config: Partial<JobConfig>): Promise<JobResult> {
    if (!config.source) throw new Error("Source is required");

    this._jobData.jobId = Bun.randomUUIDv7("hex");
    this._jobData.createdAt = new Date(Date.now()).toISOString();
    this._jobData.durationMS = "incomplete";

    this._config = {
      ...this._config,
      ...config.runnerConfig,
    } satisfies RunnerConfig;

    logJobStart({ config, jobData: this._jobData });

    this._jobData.processStartMS = performance.now();
    const source = await this.normalizeSource(config.source);
    const sourceResult = await processSource({
      source,
      ...this._config,
    });
    this._jobData.sourceSize = source.size;
    this._jobData.durationMS = performance.now() - this._jobData.processStartMS;
    this._jobData.mbSec =
      typeof this._jobData.sourceSize === "number"
        ? Number(
            (
              this._jobData.sourceSize /
              (1024 * 1024) /
              (this._jobData.durationMS / 1000)
            ).toPrecision(2)
          )
        : this._jobData.sourceSize;

    let result = {
      sourceResult,
      jobData: this._jobData,
    } satisfies JobResult;

    logJobComplete(result);
    return result;
  }

  private async normalizeSource(source: JobConfig["source"]): Promise<Source> {
    if (isSource(source)) {
      return source;
    }

    return {
      size: (await source.stat()).size,
      stream: Unicode.stream(source, 8192),
    };
  }

  get config() {
    return this._config!;
  }

  get lattice() {
    return this._lattice;
  }
}

const EM = "=".repeat(10);

export function logProcessStats({
  codepointsIn,
  tokensOut,
}: {
  codepointsIn: number;
  tokensOut: number;
}) {
  const compressionRatio = Number((tokensOut / codepointsIn).toPrecision(2));
  process.stdout.write(
    `\r${codepointsIn.toLocaleString()} codepoints → ${tokensOut.toLocaleString()} tokens (${compressionRatio}x compression)`
  );
}

export function logJobStart({
  config,
  jobData,
}: {
  config: Partial<JobConfig>;
  jobData: JobData;
}) {
  console.log(`\n${EM} [${jobData?.jobId ?? "unknown"}] JOB STATS ${EM}`);
  if (jobData) {
    console.table([jobData]);
  }
  if (config.meta) {
    console.table([config.meta]);
  }
}

export function logJobComplete({ jobData, sourceResult }: JobResult) {
  console.log(`\n${EM} [${jobData?.jobId ?? "unknown"}] JOB STATS ${EM}`);
  if (jobData) {
    console.table([jobData]);
  }

  for (const sequencer of sourceResult.sequencers) {
    const { gates, ...rest } = sequencer;
    console.log(`\n${EM} [${rest.name}] SEQUENCER STATS ${EM}`);
    console.table([rest]);
    console.log(`\n${EM} [${rest.name}] GATE STATS ${EM}`);
    console.table(gates);
  }
}
