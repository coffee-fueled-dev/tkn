import { startHealthchecks } from "./healthchecks";
import pino from "pino";
import { variables } from "./environment";
import { Subscriber } from "./subscriber";

const logger = pino({ name: "memgraph-broker" });

const subscriber = new Subscriber();
await subscriber.listen();

const { close: closeHealthchecks } = await startHealthchecks();

logger.info(`Memgraph Broker started on port ${variables.PORT}`);

process.on("SIGINT", async () => {
  logger.info("Shutting down gracefully...");
  await closeHealthchecks();
  process.exit(0);
});
