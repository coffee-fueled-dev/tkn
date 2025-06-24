export interface GetTopTokensPayload {
  sessionIds?: string[];
}

export const getTopTokensQuery = (payload: GetTopTokensPayload) => {
  const cypher = `
  MATCH g = (:Token)-[r:NEXT]->(:Token)
  WHERE $sessions IS NULL OR r.session IN $sessions

  WITH project(g) AS subgraph
  CALL pagerank.get(subgraph)
  YIELD node, rank

  RETURN node.bytes AS token, rank
  ORDER BY rank DESC
  LIMIT 150
  `;
  const params = {
    sessions: payload.sessionIds || [],
  };
  return { cypher, params };
};
