import debug from "debug";
import { createDebugPatterns, helloInnit } from "../util/hello";
import { env as environmentVariables } from "./env";

const ns = ["graph", "tkn", "server"] as const;
const env = ["info", "warn", "debug", "error"] as const;

const patterns = {
  development: createDebugPatterns(ns, env),
  production: createDebugPatterns(ns, [env[3]] as const),
};

const DEBUG = patterns[environmentVariables.NODE_ENV];

export const enableHello = () => debug.enable(DEBUG);
export const hello = helloInnit(ns, env);
