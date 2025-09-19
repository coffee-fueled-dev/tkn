import type { JobConfig } from "@tkn/pipelines";
import { resolveFile } from "../resolve-file";

export const JOBS: JobConfig[] = [
  {
    source: resolveFile("tinystories_10000.txt"),
    meta: {
      name: "tinystories_10000",
    },
  },
];
