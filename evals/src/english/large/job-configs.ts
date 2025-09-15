import { LZS, LZSBigram, LZSBoundary } from "@tkn/lzs";
import {
  jobProcessMetadata,
  type JobConfig,
  type TrainingConfig,
} from "../../harness";
import { resolveFile } from "../../resolve-file";
import { englishSamples } from "../../samples";

export const ENGLISH_LARGE_JOBS: (Omit<JobConfig, "trainingConfig"> & {
  trainingConfig?: TrainingConfig;
})[] = [
  {
    process: jobProcessMetadata(),
    source: resolveFile("tinystories_10000.txt"),
    sampleConfig: {
      run: true,
      logTokens: false,
      logProgress: false,
      samples: englishSamples,
    },
    trainingConfig: {
      lzs: new LZS({
        trie: false,
        mdl: {
          zMode: "fixed",
        },
        monitor: { mode: "extended" },
      }),
    },
    metadata: {
      language: "English -- LZS",
      code: "en",
    },
  },
  {
    process: jobProcessMetadata(),
    source: resolveFile("tinystories_10000.txt"),
    sampleConfig: {
      run: true,
      logTokens: true,
      logProgress: true,
      samples: englishSamples,
    },
    trainingConfig: {
      lzs: new LZSBoundary(new LZS(), {
        trie: false,
        mdl: {
          zMode: "fixed",
        },
        monitor: { mode: "extended" },
      }),
    },
    metadata: {
      language: "English -- Stacked LZS",
      code: "en",
    },
  },
  {
    process: jobProcessMetadata(),
    source: resolveFile("tinystories_10000.txt"),
    sampleConfig: {
      run: true,
      logTokens: true,
      logProgress: true,
      samples: englishSamples,
    },
    trainingConfig: {
      lzs: new LZSBigram(
        new LZSBoundary(new LZS(), {
          trie: false,
          mdl: {
            zMode: "fixed",
          },
        }),
        {
          monitor: { mode: "extended" },
        }
      ),
    },
    metadata: {
      language: "English -- Stacked LZS plus bigram",
      code: "en",
    },
  },
];
