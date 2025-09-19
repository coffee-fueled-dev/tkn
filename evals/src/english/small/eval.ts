import { defaultJobRunner } from "@tkn/pipelines";
import { ENGLISH_SMALL_JOBS } from "./job-configs";
import { Unicode } from "@tkn/pipelines";

async function main() {
  console.log("🌍 Starting English - Small Corpus Evaluation");
  console.log(`📊 Running ${ENGLISH_SMALL_JOBS.length} language evaluations`);

  for (const jobConfig of ENGLISH_SMALL_JOBS) {
    try {
      await defaultJobRunner.run(jobConfig);

      const codepoints = Unicode.fromString(
        "today I went to the gym and pet a cat at the park"
      );

      const tokens = defaultJobRunner.lattice?.tokens(codepoints, "sequences");

      console.log(tokens);
      console.log(tokens?.map(Unicode.toString));
    } catch (error) {
      console.error(`Failed to process ${jobConfig.meta?.name ?? ""}:`, error);
    }
  }
}

main().catch(console.error);
