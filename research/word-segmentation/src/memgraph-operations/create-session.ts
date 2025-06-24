import Cypher from "@neo4j/cypher-builder";

export interface CreateSessionPayload {
  id: string;
  tenantId: string;
  preloadUsed: string;
}

export const createSessionQuery = (payload: CreateSessionPayload) => {
  const { id, tenantId, preloadUsed } = payload;
  const session = new Cypher.Node();
  const merge = new Cypher.Merge(
    new Cypher.Pattern(session, {
      labels: ["Session", tenantId],
      properties: {
        id: new Cypher.Literal(id),
        timestamp_created: Cypher.timestamp(),
        timestamp_last_seen: Cypher.timestamp(),
        status: new Cypher.Literal("active"),
        preload_used: new Cypher.Literal(preloadUsed),
      },
    })
  );

  const { cypher, params } = merge.build();

  return { cypher, params };
};
