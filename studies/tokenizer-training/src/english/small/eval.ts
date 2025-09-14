import { DefaultJobRunner, DEFAULT_CONFIG } from "../../harness";
import { ENGLISH_SMALL_JOBS } from "./job-configs";

async function main() {
  console.log("🌍 Starting English - Small Corpus Evaluation");
  console.log(`📊 Running 1 language evaluation`);

  const runner = new DefaultJobRunner();
  const results = [];

  for (const jobConfig of ENGLISH_SMALL_JOBS) {
    const fullConfig = {
      ...jobConfig,
      trainingConfig: { ...DEFAULT_CONFIG, logSequences: true },
    };

    try {
      const result = await runner.run(fullConfig);
      results.push(result);

      console.log(
        `✅ ${
          result.metadata?.language
        } complete: ${result.avgTokensPerSample.toFixed(2)} avg tokens/sample`
      );
    } catch (error) {
      console.error(
        `❌ Failed to process ${jobConfig.metadata?.language}:`,
        error
      );
    }
  }

  // Summary
  console.log("\n🎯 Evaluation Summary:");
  console.log("═".repeat(50));

  for (const result of results) {
    const lang = result.metadata?.language || "Unknown";
    const avgTokens = result.avgTokensPerSample.toFixed(2);
    const totalSamples = result.totalSamples;

    console.log(
      `${lang.padEnd(12)} │ ${avgTokens.padStart(
        8
      )} tokens/sample │ ${totalSamples} samples`
    );
  }

  const overallAvg =
    results.reduce((sum, r) => sum + r.avgTokensPerSample, 0) / results.length;
  console.log("─".repeat(50));
  console.log(
    `Overall Avg │ ${overallAvg.toFixed(2).padStart(8)} tokens/sample │ ${
      results.length
    } languages`
  );
}

main().catch(console.error);
