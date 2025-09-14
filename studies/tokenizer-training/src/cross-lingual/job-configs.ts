import { jobProcessMetadata, type JobConfig } from "../harness";
import { resolveFile } from "../resolve-file";
import {
  arabicSamples,
  chineseSamples,
  englishSamples,
  finnishSamples,
  germanSamples,
  japaneseSamples,
  turkishSamples,
} from "../samples";

export const CROSS_LINGUAL_JOBS: Omit<JobConfig, "trainingConfig">[] = [
  {
    process: jobProcessMetadata(),
    source: resolveFile("en_sample.txt"),
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
  {
    process: jobProcessMetadata(),
    source: resolveFile("de_sample.txt"),
    sampleConfig: {
      run: true,
      logTokens: true,
      logProgress: true,
      samples: germanSamples,
    },
    metadata: {
      language: "German",
      code: "de",
    },
  },
  {
    process: jobProcessMetadata(),
    source: resolveFile("zh_sample.txt"),
    sampleConfig: {
      run: true,
      logTokens: true,
      logProgress: true,
      samples: chineseSamples,
    },
    metadata: { language: "Chinese", code: "zh" },
  },
  {
    process: jobProcessMetadata(),
    source: resolveFile("ar_sample.txt"),
    sampleConfig: {
      run: true,
      logTokens: true,
      logProgress: true,
      samples: arabicSamples,
    },
    metadata: { language: "Arabic", code: "ar" },
  },
  {
    process: jobProcessMetadata(),
    source: resolveFile("ja_sample.txt"),
    sampleConfig: {
      run: true,
      logTokens: true,
      logProgress: true,
      samples: japaneseSamples,
    },
    metadata: { language: "Japanese", code: "ja" },
  },
  {
    process: jobProcessMetadata(),
    source: resolveFile("tr_sample.txt"),
    sampleConfig: {
      run: true,
      logTokens: true,
      logProgress: true,
      samples: turkishSamples,
    },
    metadata: { language: "Turkish", code: "tr" },
  },
  {
    process: jobProcessMetadata(),
    source: resolveFile("fi_sample.txt"),
    sampleConfig: {
      run: true,
      logTokens: true,
      logProgress: true,
      samples: finnishSamples,
    },
    metadata: { language: "Finnish", code: "fi" },
  },
];
