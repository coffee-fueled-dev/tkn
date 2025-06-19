import { TknServer } from "./lib/server";

const { shutdown } = TknServer();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
