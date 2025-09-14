import { jobProcessMetadata, type JobConfig } from "../harness";
import { resolveFile } from "../resolve-file";

export const PERFORMANCE_JOBS: Omit<JobConfig, "trainingConfig">[] = [
  {
    process: jobProcessMetadata(),
    source: resolveFile("tinystories_1000.txt"),
    sampleConfig: {
      run: false,
    },
    metadata: {
      name: "Dry Run",
      description: "Dry run of the LZS tokenizer. No database ingestion.",
    },
  },
];
