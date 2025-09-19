import type { JobConfig } from "@tkn/pipelines";
import { resolveFile } from "../../resolve-file";

export const ENGLISH_SMALL_JOBS: JobConfig[] = [
  {
    source: resolveFile("tinystories_1000.txt"),
    meta: {
      name: "tinystories_1000",
    },
  },
];
