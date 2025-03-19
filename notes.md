Pagerank query that recovers original token values:

CALL pagerank.get() YIELD node, rank
WITH node, rank
ORDER BY rank DESC

WITH node, rank,
CASE WHEN node.lookupKeys IS NULL THEN [] ELSE split(node.lookupKeys, '|') END AS keys
WHERE size(keys) > 0
UNWIND range(0, size(keys)-1) AS index
WITH node.value AS tokenValue, keys[index] AS key, index, rank
WHERE key IS NOT NULL
MATCH (dict:ValueDictionary)
WHERE dict.key = key
WITH tokenValue, index, dict.value AS value, rank
ORDER BY tokenValue, index
WITH tokenValue, collect(value) AS originalValues, rank
WHERE size(originalValues) > 0
RETURN reduce(s = "", value IN originalValues | s +
CASE WHEN s = "" THEN "" ELSE ", " END +
value) AS originalTokenString, rank
ORDER BY rank DESC
