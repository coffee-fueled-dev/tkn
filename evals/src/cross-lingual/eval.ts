import { JobRunner } from "../harness";
import { CROSS_LINGUAL_JOBS } from "./job-configs";

async function main() {
  console.log("🌍 Starting Cross-Lingual Evaluation");
  console.log(`📊 Running ${CROSS_LINGUAL_JOBS.length} language evaluations`);

  const runner = new JobRunner({ logSequences: false });
  const results = [];

  for (const jobConfig of CROSS_LINGUAL_JOBS) {
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
