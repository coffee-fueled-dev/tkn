import { z } from "zod";
import { lazilyValidate, buildDynamic } from "tkn-shared";

const environmentSchema = z.object({
  MEMGRAPH_URI: z.string().default("bolt://localhost:7687"),
  MEMGRAPH_USER: z.string().default("memgraph"),
  MEMGRAPH_PASS: z.string().default("memgraph"),
  MEMGRAPH_DB_NAME: z.string().default("memgraph"),
  REDIS_URI: z.string().default("redis://localhost:6379"),
  PORT: z.number().default(4002),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  BATCH_SIZE: z.number().default(100),
  BATCH_TIMEOUT_MS: z.number().default(5000),
  BASE_CHANNEL: z.string().default("tokens"),
});

export const variables = lazilyValidate(
  environmentSchema,
  buildDynamic(environmentSchema)
);
