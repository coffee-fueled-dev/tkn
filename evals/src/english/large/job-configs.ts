import { jobProcessMetadata, type JobConfig } from "../../harness";
import { resolveFile } from "../../resolve-file";
import { englishSamples } from "../../samples";

export const ENGLISH_LARGE_JOBS: Omit<JobConfig, "trainingConfig">[] = [
  {
    process: jobProcessMetadata(),
    source: resolveFile("brown_gold_standard.txt"),
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
