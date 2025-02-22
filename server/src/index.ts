import { startServer } from "./server";
import { env } from "./lib/env";

const { PORT } = env;

startServer(PORT);
