import { TknServer } from "./server";
import { env } from "./lib/env";

new TknServer(env.PORT);
