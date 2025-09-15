import { Lattice } from "@tkn/tokenizer";

import {
  type JobConfig,
  type JobResult,
  type IJobRunner,
  type Sample,
  type TrainingConfig,
  DEFAULT_CONFIG,
} from "./domain";
import { processSource, type Source } from "./process-source";
import { Unicode } from "@tkn/serializers";
import { processSample, type SampleResult } from "./process-sample";

export class JobRunner implements IJobRunner {
  private _sharedConfig?: TrainingConfig;

  constructor(sharedConfig?: TrainingConfig) {
    this._sharedConfig = sharedConfig;
  }

  async run(config: Partial<JobConfig>): Promise<JobResult> {
    if (!config.source) throw new Error("Source is required");
    if (!config.sampleConfig) throw new Error("Sample config is required");
    if (!config.process) throw new Error("Process config is required");

    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...this._sharedConfig,
      ...config.trainingConfig,
    };

    logJobStart(config as JobConfig);

    // Training phase
    const source = await this.normalizeSource(config.source);

    // Pass the configs down to processSource - it will handle instance creation
    const { ingest, ...trainingResult } = await processSource({
      source,
      ...mergedConfig,
    });

    let result: JobResult = {
      training: trainingResult,
      metadata: config.metadata,
      process: { ...config.process, duration: performance.now() },
    };

    if (!config.sampleConfig.run) {
      logTrainingResult(result.training);
      logJobResult(result);
      return result;
    }

    if (!config.sampleConfig.samples) {
      console.log(
        `Job failed: Samples are required when sampleConfig.run is set to true`
      );
      console.table([config.metadata]);
      throw new Error(
        "Samples are required when sampleConfig.run is set to true"
      );
    }

    // Evaluation phase
    console.log(
      `Tokenizing samples (${config.sampleConfig.samples.length} samples)`
    );
    const sampleResults = await this.evaluateSamples(
      config.sampleConfig.samples,
      config.sampleConfig,
      ingest?.lattice
    );

    result = {
      training: trainingResult,
      metadata: config.metadata,
      samples: {
        results: sampleResults,
        total: sampleResults.length,
      },
      process: { ...config.process, duration: performance.now() },
    };

    logTrainingResult(result.training);
    logJobResult(result);
    return result;
  }

  private async normalizeSource(source: JobConfig["source"]): Promise<Source> {
    // If it's already a Source (has Symbol.asyncIterator), return as-is
    if (typeof source === "object" && Symbol.asyncIterator in source) {
      return source as Source;
    }

    return Unicode.stream(source, 8192);
  }

  private async evaluateSamples(
    samples: Sample[],
    sampleConfig: JobConfig["sampleConfig"],
    lattice?: Lattice
  ): Promise<SampleResult[]> {
    const results: SampleResult[] = [];

    for (const sample of samples) {
      if (sampleConfig.logProgress) {
        console.log(
          `Evaluating: "${sample.content.substring(0, 50)}${
            sample.content.length > 50 ? "..." : ""
          }"`
        );
      }

      try {
        const result = processSample({
          content: sample.content,
          lattice,
          metadata: sample.metadata,
        });

        results.push(result);
        logSampleResult(result);
      } catch (error) {
        console.warn(`Failed to tokenize: "${sample.content}" - ${error}`);
      }
    }

    return results;
  }
}

export function logJobStart(config: JobConfig) {
  console.log(`Starting job`);
  console.table([config.metadata]);

  if (config.process) {
    console.log("\nProcess Info:");
    console.table([config.process]);
  }
}

export function logJobResult(result: JobResult) {
  console.log(`Job completed`);
  console.table([result.metadata]);

  if (result.process) {
    console.log("\nProcess Info:");
    console.table([result.process]);
  }
}

export function logTrainingResult(result: JobResult["training"]) {
  if (result?.lzs) {
    console.log("\nLZS Training Stats:");
    console.table(result.lzs);
  }

  if (result?.lattice) {
    console.log("\nLattice Stats:");
    console.table(result.lattice);
  }
}

export function logSampleResult(result: SampleResult) {
  // Create object with strings as keys and tokens as values
  const tokenTable = result.strings.reduce((acc, str, i) => {
    acc[str] = result.tokens[i];
    return acc;
  }, {} as Record<string, number>);

  console.table([tokenTable]);
  console.table([result.tokenizerStats?.lastInference]);
  console.log("");
}
