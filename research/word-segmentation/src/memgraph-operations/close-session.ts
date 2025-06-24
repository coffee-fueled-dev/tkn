import Cypher from "@neo4j/cypher-builder";

export interface CloseSessionPayload {
  id: string;
}

export const closeSessionQuery = (payload: CloseSessionPayload) => {
  const { id } = payload;
  const session = new Cypher.Node();
  const status = session.property("status");
  const timestampLastSeen = session.property("timestamp_last_seen");
  const match = new Cypher.Match(
    new Cypher.Pattern(session, {
      labels: ["Session"],
      properties: { id: new Cypher.Literal(id) },
    })
  ).set(
    [status, new Cypher.Literal("closed")],
    [timestampLastSeen, Cypher.timestamp()]
  );

  const { cypher, params } = match.build();

  return { cypher, params };
};
