import type { JobConfig } from "../harness";
import { resolveFile } from "../resolve-file";
import {
  arabicSamples,
  chineseSamples,
  englishSamples,
  finnishSamples,
  germanSamples,
  japaneseSamples,
  turkishSamples,
} from "./samples";

export const CROSS_LINGUAL_JOBS: Omit<JobConfig, "trainingConfig">[] = [
  {
    source: resolveFile("en_sample.txt"),
    samples: englishSamples,
    metadata: {
      language: "English",
      code: "en",
    },
  },
  {
    source: resolveFile("de_sample.txt"),
    samples: germanSamples,
    metadata: {
      language: "German",
      code: "de",
    },
  },
  {
    source: resolveFile("zh_sample.txt"),
    samples: chineseSamples,
    metadata: { language: "Chinese", code: "zh" },
  },
  {
    source: resolveFile("ar_sample.txt"),
    samples: arabicSamples,
    metadata: { language: "Arabic", code: "ar" },
  },
  {
    source: resolveFile("ja_sample.txt"),
    samples: japaneseSamples,
    metadata: { language: "Japanese", code: "ja" },
  },
  {
    source: resolveFile("tr_sample.txt"),
    samples: turkishSamples,
    metadata: { language: "Turkish", code: "tr" },
  },
  {
    source: resolveFile("fi_sample.txt"),
    samples: finnishSamples,
    metadata: { language: "Finnish", code: "fi" },
  },
];
