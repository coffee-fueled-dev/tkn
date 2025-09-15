import { JobRunner } from "../harness";
import { PERFORMANCE_JOBS } from "./job-configs";

async function main() {
  console.log("🌍 Starting LZS Performance Evaluation");
  console.log(`📊 Running ${PERFORMANCE_JOBS.length} evaluations`);

  const runner = new JobRunner({
    ingest: false,
    logSequences: false,
    logProgress: false,
    lzs: { monitor: { mode: "extended" } },
  });

  for (const jobConfig of PERFORMANCE_JOBS) {
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
