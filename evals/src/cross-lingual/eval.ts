import { JobRunner } from "../harness";
import { CROSS_LINGUAL_JOBS } from "./job-configs";

async function main() {
  console.log("🌍 Starting Cross-Lingual Evaluation");
  console.log(`📊 Running ${CROSS_LINGUAL_JOBS.length} language evaluations`);

  const runner = new JobRunner({ logSequences: false });

  for (const jobConfig of CROSS_LINGUAL_JOBS) {
    try {
      await runner.run(jobConfig);
    } catch (error) {
      console.error(
        `❌ Failed to process ${jobConfig.metadata?.language}:`,
        error
      );
    }
  }
}

main().catch(console.error);
