import { Tokenizer, Lattice } from "@tkn/tokenizer";
import { UnicodeReader } from "@tkn/serializers";

import {
  type JobConfig,
  type JobResult,
  type JobRunner,
  type SampleResult,
  type TrainingConfig,
  DEFAULT_CONFIG,
} from "./domain";
import { processSource, type Source } from "./process-source";

export class DefaultJobRunner implements JobRunner {
  private _sharedConfig?: TrainingConfig;

  constructor(sharedConfig?: TrainingConfig) {
    this._sharedConfig = sharedConfig;
  }

  async run(config: JobConfig): Promise<JobResult> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config.trainingConfig };

    console.log(`🚀 Starting job: ${config.metadata?.language || "Unknown"}`);

    // Training phase
    console.log(`📚 Training phase...`);
    const source = await this.convertToSource(config.source);

    // Pass the configs down to processSource - it will handle instance creation
    const trainingResult = await processSource({
      source,
      showProgress: mergedConfig.showProgress,
      logTokens: mergedConfig.logTokens,
      lzs: this._sharedConfig?.lzs || mergedConfig.lzs,
      lattice: this._sharedConfig?.lattice || mergedConfig.lattice,
    });

    console.log(`✅ Training complete`);

    // Evaluation phase
    console.log(`🧪 Evaluation phase (${config.samples.length} samples)...`);
    const sampleResults = await this.evaluateSamples(
      config.samples,
      mergedConfig,
      trainingResult.lattice
    );

    const avgTokensPerSample =
      sampleResults.reduce((sum, r) => sum + r.tokens.length, 0) /
      sampleResults.length;

    const result: JobResult = {
      training: trainingResult,
      evaluations: sampleResults,
      avgTokensPerSample,
      totalSamples: sampleResults.length,
      trainingConfig: mergedConfig,
      metadata: config.metadata,
    };

    console.log(
      `✨ Job complete - ${avgTokensPerSample.toFixed(2)} avg tokens/sample`
    );
    return result;
  }

  private async convertToSource(source: JobConfig["source"]): Promise<Source> {
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
        const chunkSize = 8192; // Match UnicodeReader's chunk size
        for (let i = 0; i < codepoints.length; i += chunkSize) {
          yield codepoints.slice(i, i + chunkSize);
        }
      },
    };
  }

  private async evaluateSamples(
    samples: JobConfig["samples"],
    config: TrainingConfig,
    trainedLattice?: Lattice
  ): Promise<SampleResult[]> {
    const results: SampleResult[] = [];

    // Use the trained lattice from training phase, or fallback to shared/config
    const latticeToUse =
      trainedLattice || this._sharedConfig?.lattice || config.lattice;

    const tokenizer = new Tokenizer({ lattice: latticeToUse });

    for (const sample of samples) {
      if (config.showProgress) {
        console.log(
          `🔍 Evaluating: "${sample.content.substring(0, 50)}${
            sample.content.length > 50 ? "..." : ""
          }"`
        );
      }

      try {
        // Use the tokenizer to decode the sample text into tokens
        const tokens = tokenizer.decode(sample.content);

        // Convert tokens to readable strings
        const strings = tokenizer.toStrings(tokens);

        // Calculate perplexity stats
        const stats = tokenizer.computePerplexity(tokens);

        const result: SampleResult = {
          content: sample.content,
          tokens,
          strings,
          stats,
          metadata: sample.metadata,
        };

        results.push(result);

        if (config.logSequences) {
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
        } else if (config.showProgress) {
          console.log(`  ✅ ${tokens.length} tokens`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to tokenize: "${sample.content}" - ${error}`);
      }
    }

    return results;
  }
}
