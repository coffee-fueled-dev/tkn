import { JobRunner } from "../../harness";
import { ENGLISH_LARGE_JOBS } from "./job-configs";

async function main() {
  console.log("🌍 Starting English - Large Corpus Evaluation");
  console.log(`📊 Running ${ENGLISH_LARGE_JOBS.length} language evaluations`);

  const runner = new JobRunner({ logSequences: false });
  const results = [];

  for (const jobConfig of ENGLISH_LARGE_JOBS) {
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

  console.log(
    JSON.stringify(
      results.map(({ samples, ...r }) => r),
      null,
      2
    )
  );
}

main().catch(console.error);
