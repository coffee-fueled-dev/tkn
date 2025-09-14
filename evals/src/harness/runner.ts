import { Tokenizer, Lattice } from "@tkn/tokenizer";
import { UnicodeReader } from "@tkn/serializers";

import {
  type JobConfig,
  type JobResult,
  type IJobRunner,
  type Sample,
  type SampleResult,
  type TrainingConfig,
  DEFAULT_CONFIG,
} from "./domain";
import { processSource, type Source } from "./process-source";

export class JobRunner implements IJobRunner {
  private _sharedConfig?: TrainingConfig;

  constructor(sharedConfig?: TrainingConfig) {
    this._sharedConfig = sharedConfig;
  }

  async run(config: Partial<JobConfig>): Promise<JobResult> {
    if (!config.source) {
      throw new Error("Source is required");
    }
    if (!config.sampleConfig) {
      throw new Error("Sample config is required");
    }
    if (!config.process) {
      throw new Error("Process config is required");
    }
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...this._sharedConfig,
      ...config.trainingConfig,
    };

    console.log(
      `🚀 Starting job\n${JSON.stringify(config.metadata, null, 2) ?? ""}`
    );

    // Training phase
    console.log(`📚 Training tokenizer`);
    const source = await this.normalizeSource(config.source);

    // Pass the configs down to processSource - it will handle instance creation
    const trainingResult = await processSource({
      source,
      ...mergedConfig,
    });

    if (!config.sampleConfig.run) {
      console.log(
        `✨ Job complete\n${JSON.stringify(config.metadata, null, 2) ?? ""}`
      );
      return {
        training: trainingResult,
        metadata: config.metadata,
        process: { ...config.process, completedAt: performance.now() },
      };
    }

    if (!config.sampleConfig.samples) {
      throw new Error(
        "Samples are required when sampleConfig.run is set to true"
      );
    }

    // Evaluation phase
    console.log(
      `🧪 Tokenizing samples (${config.sampleConfig.samples.length} samples)`
    );
    const sampleResults = await this.evaluateSamples(
      config.sampleConfig.samples,
      config.sampleConfig,
      trainingResult.ingest?.lattice
    );

    console.log(`✨ Job complete\n${config.metadata ?? ""}`);

    const avgTokensPerSample =
      sampleResults.reduce((sum, r) => sum + r.tokens.length, 0) /
      sampleResults.length;

    return {
      training: trainingResult,
      metadata: config.metadata,
      samples: {
        results: sampleResults,
        total: sampleResults.length,
        avgTokensPerSample,
      },
      process: { ...config.process, completedAt: performance.now() },
    };
  }

  private async normalizeSource(source: JobConfig["source"]): Promise<Source> {
    // If it's already a Source (has Symbol.asyncIterator), return as-is
    if (typeof source === "object" && Symbol.asyncIterator in source) {
      return source as Source;
    }

    // If it's a BunFile, convert to Source using UnicodeReader pattern
    const text = await source.text();
    const codepoints = UnicodeReader.stringToCodepoints(text);

    // Create an async iterable source that yields chunks of codepoints
    return {
      async *[Symbol.asyncIterator]() {
        const chunkSize = 8192;
        for (let i = 0; i < codepoints.length; i += chunkSize) {
          yield codepoints.slice(i, i + chunkSize);
        }
      },
    };
  }

  private async evaluateSamples(
    samples: Sample[],
    sampleConfig: JobConfig["sampleConfig"],
    lattice?: Lattice
  ): Promise<SampleResult[]> {
    const results: SampleResult[] = [];
    const tokenizer = new Tokenizer({ lattice });

    for (const sample of samples) {
      if (sampleConfig.logProgress) {
        console.log(
          `🔍 Evaluating: "${sample.content.substring(0, 50)}${
            sample.content.length > 50 ? "..." : ""
          }"`
        );
      }

      try {
        const tokens = tokenizer.decode(sample.content);
        const strings = tokenizer.toStrings(tokens);
        const stats = tokenizer.computePerplexity(tokens);

        const result: SampleResult = {
          content: sample.content,
          tokens,
          strings,
          stats,
          metadata: sample.metadata,
        };

        results.push(result);

        if (sampleConfig.logTokens) {
          console.log(
            `  📋 Tokens (${tokens.length}):\n[${strings.join(
              " | "
            )}]\n[${tokens.join(" | ")}]\n[${Object.entries(stats)
              .map(([k, v]) =>
                typeof v === "number" ? `${k}: ${v.toFixed(3)}` : null
              )
              .filter(Boolean)
              .join(" | ")}]`
          );
        } else if (sampleConfig.logProgress) {
          console.log(`  ✅ ${tokens.length} tokens`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to tokenize: "${sample.content}" - ${error}`);
      }
    }

    return results;
  }
}
