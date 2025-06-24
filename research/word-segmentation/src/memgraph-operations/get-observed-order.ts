export interface GetObservedOrderPayload {
  sessionId: string;
}

export const getObservedOrderQuery = (payload: GetObservedOrderPayload) => {
  const cypher = `
    match (session:Session {id: $session})-[observation:OBSERVED]-(token:Token)

    return token.bytes as token
    order by observation.session_index asc
    limit 50
  `;
  const params = {
    session: payload.sessionId,
  };
  return { cypher, params };
};
