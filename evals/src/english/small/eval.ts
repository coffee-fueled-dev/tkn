import { JobRunner } from "../../harness";
import { ENGLISH_SMALL_JOBS } from "./job-configs";

async function main() {
  console.log("🌍 Starting English - Small Corpus Evaluation");
  console.log(`📊 Running ${ENGLISH_SMALL_JOBS.length} language evaluations`);

  const runner = new JobRunner({ logSequences: false });

  for (const jobConfig of ENGLISH_SMALL_JOBS) {
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
