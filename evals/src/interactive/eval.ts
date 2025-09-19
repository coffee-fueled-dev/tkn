import { defaultJobRunner } from "@tkn/pipelines";
import { promptLoop } from "./prompt-loop";
import { JOBS } from "./job-configs";

async function main() {
  console.log("🌍 Starting Interactive Evaluation");

  for (const jobConfig of JOBS) {
    try {
      await defaultJobRunner.run(jobConfig);
    } catch (error) {
      console.error(`Failed to process ${jobConfig.meta?.name ?? ""}:`, error);
    }
  }

  if (!defaultJobRunner.lattice) {
    throw new Error("Lattice not found");
  }

  promptLoop(defaultJobRunner.lattice);
}

main().catch(console.error);
