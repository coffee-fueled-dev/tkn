import { TknServer } from "./lib/tkn-server";

const { shutdown } = TknServer();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
