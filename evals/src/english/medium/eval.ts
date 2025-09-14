import { JobRunner } from "../../harness";
import { ENGLISH_MEDIUM_JOBS } from "./job-configs";

async function main() {
  console.log("🌍 Starting English - Medium Corpus Evaluation");
  console.log(`📊 Running ${ENGLISH_MEDIUM_JOBS.length} language evaluations`);

  const runner = new JobRunner({ logSequences: false });
  const results = [];

  for (const jobConfig of ENGLISH_MEDIUM_JOBS) {
    try {
      const result = await runner.run(jobConfig);
      results.push(result);
    } catch (error) {
      console.error(
        `❌ Failed to process ${jobConfig.metadata?.language}:`,
        error
      );
    }
  }

  console.log(JSON.stringify(results[0].training, null, 2));
}

main().catch(console.error);
