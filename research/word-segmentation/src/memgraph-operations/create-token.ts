import Cypher from "@neo4j/cypher-builder";

export interface CreateTokenPayload {
  bytes: number[];
  sessionId: string;
  sessionIndex: number;
  tenantId: string;
}

export const createTokenQuery = (payload: CreateTokenPayload) => {
  const { bytes, sessionId, sessionIndex, tenantId } = payload;
  const token = new Cypher.Node();
  const session = new Cypher.Node();
  const observed = new Cypher.Relationship();
  const mergeToken = new Cypher.Merge(
    new Cypher.Pattern(token, {
      labels: ["Token", tenantId],
      properties: { bytes: new Cypher.Literal(bytes) },
    })
  );
  const mergeTokenToSession = new Cypher.Merge(
    new Cypher.Pattern(token)
      .related(observed, {
        type: "OBSERVED",
        properties: {
          session_index: new Cypher.Literal(sessionIndex),
        },
        direction: "right",
      })
      .to(session)
  );

  const matchSession = new Cypher.Match(
    new Cypher.Pattern(session, {
      labels: ["Session"],
      properties: { id: new Cypher.Literal(sessionId) },
    })
  );

  const statement = Cypher.utils.concat(
    matchSession,
    mergeToken,
    mergeTokenToSession
  );
  const { cypher, params } = statement.build();
  return { cypher, params };
};
