Query to recombine tkns from database using the dict:

MATCH (tkn:Tkn)
WITH tkn, split(tkn.lookupKeys, '|') AS keys
UNWIND range(0, size(keys)-1) AS index
WITH tkn.value AS tokenValue, keys[index] AS key, index
MATCH (dict:ValueDictionary)
WHERE dict.key = key
WITH tokenValue, index, dict.value AS value
ORDER BY tokenValue, index
WITH tokenValue, collect(value) AS originalValues
RETURN tokenValue AS encodedToken,
originalValues,
reduce(s = "", value IN originalValues | s +
CASE WHEN s = "" THEN "" ELSE ", " END +
value) AS originalTokenString
