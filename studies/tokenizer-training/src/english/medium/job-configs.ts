import type { JobConfig } from "../../harness";
import { resolveFile } from "../../resolve-file";
import { englishSamples } from "../../cross-lingual/samples";

export const ENGLISH_MEDIUM_JOBS: Omit<JobConfig, "trainingConfig">[] = [
  {
    source: resolveFile("tinystories_1000.txt"),
    samples: englishSamples,
    metadata: {
      language: "English",
      code: "en",
    },
  },
];
