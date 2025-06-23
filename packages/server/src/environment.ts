import { z } from "zod";
import { lazilyValidate, buildDynamic } from "tkn-shared";
import {
  keyGenerators,
  type KeyGeneratorName,
} from "./socket-server/key-generators";

// Dynamically extract the allowed key generator names from the actual object
const keyGeneratorNames = Object.keys(keyGenerators) as [
  KeyGeneratorName,
  ...KeyGeneratorName[]
];

const environmentSchema = z.object({
  REDIS_URI: z.string().default("redis://localhost:6379"),
  TKN_PORT: z.number().default(4000),
  PORT: z.number().default(4000),
  TKN_HTTP_URL: z.string().default("http://localhost:4000"),
  TKN_SOCKET_URL: z.string().default("localhost:4001"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  BATCH_SIZE: z.number().default(1000),
  ITEM_SIZE_THRESHOLD: z.number().default(1000),
  BANK_SIZE: z.number().default(10000),
  KEY_GENERATOR: z.enum(keyGeneratorNames).default("fastHash"),
  MAX_WINDOW_SIZE: z.number().default(1024),
  MESSAGE_HEADER_SIZE: z.number().default(5),
  MESSAGE_BUFFER_SIZE: z.number().default(8192),
});

export const variables = lazilyValidate(
  environmentSchema,
  buildDynamic(environmentSchema)
);
