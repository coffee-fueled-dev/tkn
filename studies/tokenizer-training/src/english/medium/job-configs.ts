import { jobProcessMetadata, type JobConfig } from "../../harness";
import { resolveFile } from "../../resolve-file";
import { englishSamples } from "../../samples";

export const ENGLISH_MEDIUM_JOBS: Omit<JobConfig, "trainingConfig">[] = [
  {
    process: jobProcessMetadata(),
    source: resolveFile("tinystories_1000.txt"),
    sampleConfig: {
      run: true,
      logTokens: true,
      logProgress: true,
      samples: englishSamples,
    },
    metadata: {
      language: "English",
      code: "en",
    },
  },
];
