import { JobRunner } from "../../harness";
import { ENGLISH_MEDIUM_JOBS } from "./job-configs";

async function main() {
  console.log("🌍 Starting English - Medium Corpus Evaluation");
  console.log(`📊 Running ${ENGLISH_MEDIUM_JOBS.length} language evaluations`);

  const runner = new JobRunner({ logSequences: false });

  for (const jobConfig of ENGLISH_MEDIUM_JOBS) {
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
