```cypher
CREATE TRIGGER link_markov
ON --> CREATE AFTER COMMIT EXECUTE
UNWIND createdEdges AS obsRel

WITH obsRel.session_index as idx

MATCH (sourceToken:Token)-[thisObs:OBSERVED {session_index: idx}]->(session:Session)

MATCH (otherToken:Token)-[otherObs:OBSERVED]->(session)
WHERE otherObs.session_index = idx + 1 OR otherObs.session_index = idx - 1

WITH sourceToken, otherToken, thisObs, otherObs, session
CALL {
  WITH sourceToken, otherToken, session
  WHERE otherObs.session_index > thisObs.session_index
  MERGE (sourceToken)-[:NEXT {session: session.id}]->(otherToken)
  RETURN 1 as res

  UNION

  WITH sourceToken, otherToken, session
  WHERE otherObs.session_index < thisObs.session_index
  MERGE (otherToken)-[:NEXT {session: session.id}]->(sourceToken)
  RETURN 1 as res
}
```
