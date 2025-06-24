export interface CreateTokenBatchPayload {
  tokens: { bytes: number[]; sessionIndex: number }[];
  sessionId: string;
}

export const createTokenBatchQuery = (payload: CreateTokenBatchPayload) => {
  const { tokens, sessionId } = payload;
  const cypher = `
  MATCH (session:Session {id: $sessionId})
  UNWIND $tokens as tokenData
  MERGE (t:Token {bytes: tokenData.bytes})
  MERGE (t)-[r:OBSERVED {session_index: tokenData.sessionIndex}]->(session)
  `;
  const params = {
    tokens,
    sessionId,
  };
  return { cypher, params };
};
