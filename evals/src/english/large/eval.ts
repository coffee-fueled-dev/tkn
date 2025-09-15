import { JobRunner } from "../../harness";
import { ENGLISH_LARGE_JOBS } from "./job-configs";

async function main() {
  console.log("🌍 Starting English - Large Corpus Evaluation");
  console.log(`📊 Running ${ENGLISH_LARGE_JOBS.length} language evaluations`);

  const runner = new JobRunner({ logSequences: false });

  for (const jobConfig of ENGLISH_LARGE_JOBS) {
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
