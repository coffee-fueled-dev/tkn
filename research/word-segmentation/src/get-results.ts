import { asPlaintext } from "./decoder";
import { memgraphOperations } from "./memgraph-operations/memgraph";
import { logger } from "./index";

export const getResults = async (sessionId: string, pastSessions: string[]) => {
  const [topTokens, observedOrder] = await Promise.all([
    memgraphOperations
      .getTopTokens({ sessionIds: pastSessions })
      .then((result) =>
        result.records.map((record) => {
          const serializedBytes = record.get("token");
          const converted = serializedBytes.map((b) => b.toNumber());
          logger.debug({ converted }, "Converted token -- from top tokens");
          return new Uint8Array(converted);
        })
      ),
    memgraphOperations
      .getObservedOrder({
        sessionId,
      })
      .then((result) =>
        result.records.map((record) => {
          const serializedBytes = record.get("token");
          const converted = serializedBytes.map((b) => b.toNumber());
          logger.debug({ converted }, "Converted token -- from observed order");
          return new Uint8Array(converted);
        })
      ),
  ]);

  logger.info(
    { topTokens: topTokens.map(asPlaintext).join(" | ") },
    "Top tokens"
  );
  logger.info(
    { observedOrder: observedOrder.map(asPlaintext).join(" | ") },
    "Observed order"
  );

  return {
    topTokens,
    observedOrder,
  };
};
