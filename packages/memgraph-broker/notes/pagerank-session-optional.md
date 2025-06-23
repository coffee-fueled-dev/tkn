```cypher
MATCH g=(:Token)-[r:NEXT]->(:Token)
WHERE $session IS NULL OR r.session_id = $session

WITH project(g) AS subgraph
CALL pagerank.get(subgraph)
YIELD node, rank
RETURN node.bytes, rank
ORDER BY rank DESC
```
