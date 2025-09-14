import type { JobConfig } from "../../harness";
import { resolveFile } from "../../resolve-file";
import { englishSamples } from "../../cross-lingual/samples";

export const ENGLISH_SMALL_JOBS: Omit<JobConfig, "trainingConfig">[] = [
  {
    source: resolveFile("tinystories_100.txt"),
    samples: englishSamples,
    metadata: {
      language: "English",
      code: "en",
    },
  },
];
