import { JobRunner } from "../harness";
import { PERFORMANCE_JOBS } from "./job-configs";

async function main() {
  console.log("🌍 Starting LZS Performance Evaluation");
  console.log(`📊 Running ${PERFORMANCE_JOBS.length} evaluations`);

  const runner = new JobRunner({
    ingest: false,
    logSequences: false,
    logProgress: false,
    lzs: { stats: { mode: "extended" } },
  });
  const results = [];

  for (const jobConfig of PERFORMANCE_JOBS) {
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

  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
