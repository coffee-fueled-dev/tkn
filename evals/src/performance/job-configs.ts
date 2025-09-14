import { NoOpByteTrie } from "../../../packages/lzs/src/byte-trie";
import {
  jobProcessMetadata,
  type JobConfig,
  type TrainingConfig,
} from "../harness";
import { resolveFile } from "../resolve-file";

export const PERFORMANCE_JOBS: (Omit<JobConfig, "trainingConfig"> & {
  trainingConfig?: TrainingConfig;
})[] = [
  {
    process: jobProcessMetadata(),
    source: resolveFile("tinystories_1000.txt"),
    sampleConfig: {
      run: false,
    },
    metadata: {
      name: "Baseline",
      description: "1000 tiny stories. Default config, no DB writes.",
    },
  },
  {
    process: jobProcessMetadata(),
    source: resolveFile("tinystories_1000.txt"),
    sampleConfig: {
      run: false,
    },
    metadata: {
      name: "No Trie",
      description: "1000 tiny stories. No-op trie, no DB writes.",
    },
    trainingConfig: {
      lzs: {
        trie: false,
        monitor: { mode: "extended" },
        mdl: {
          zMode: "fixed",
        },
      },
    },
  },
];
