Category 1: I/O-Bound Optimizations (Database Interaction)

This is likely the single biggest area for performance gains, as database operations are almost always slower than in-memory computation.

2.1. Use UNWIND for Batch Database Writes

Opportunity: The SyncStream's processBatch method loops through the token buffer and executes a MERGE query for each pair of tokens inside a single transaction.

The Problem: This is a classic "N+1" query problem. Even within a transaction, making 500 separate calls to the database driver involves significant overhead. The database has to plan and execute 500 small queries.

The Solution: Re-architect the query to use UNWIND. Collect all the token pairs and dictionary entries into lists in your application, then send them to the database in a single query. The database can then un-batch the list and process it much more efficiently.

Current (Slow) Approach:

Generated javascript
for (pair of pairs) {
await tx.run("MERGE (a)-[:REL]->(b)", pair.params);
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
JavaScript
IGNORE_WHEN_COPYING_END

Optimized UNWIND Approach:

Generated javascript
// In your application:
const pairBatch = [
{ tkn1v: 'valA', tkn2v: 'valB', ... },
{ tkn1v: 'valC', tkn2v: 'valD', ... },
// ... 500 pairs
];
const dictBatch = [
{ key: 'k1', value: 'v1' },
// ... all dictionary entries
];

// In a single transaction:
await tx.run(`  // First, process all dictionary entries
  UNWIND $dictBatch as entry
  MERGE (d:ValueDictionary:$tid {key: entry.key})
  ON CREATE SET d.value = entry.value`, { dictBatch, tid: this.tenantId });

await tx.run(`  // Then, process all relationships
  UNWIND $pairBatch as pair
  MERGE (tkn1:Tkn:$tid {value: pair.tkn1v})
  ON CREATE SET tkn1.lookupKeys = pair.tkn1k
  MERGE (tkn2:Tkn:$tid {value: pair.tkn2v})
  ON CREATE SET tkn2.lookupKeys = pair.tkn2k
  MERGE (tkn1)-[:D1 {idx: pair.tkn1idx, session: $sid}]->(tkn2)`, { pairBatch, sid: this.sessionId, tid: this.tenantId });
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
JavaScript
IGNORE_WHEN_COPYING_END

Expected Impact: Very High. This is the most important optimization you can make. It can reduce the time spent in database transactions by an order of magnitude, dramatically increasing the overall throughput of SyncStream.

Category 3: Architectural & Memory Optimizations
3.1. Encourage and Optimize Client-Side Batching

Opportunity: The TKN protocol supports a TYPE_BATCH message.

The Problem: If clients send many small messages instead of one large batch, the system incurs overhead for every single message (network packets, socket reads, protocol parsing).

The Solution:

Documentation/SDK: Strongly encourage users of your client libraries to use the sendBatch method whenever possible.

Server-Side: Ensure the server's read buffer (socket.data.buffer) is appropriately sized to handle large batches without needing to resize frequently. The current 8K initial buffer is a reasonable start.

Expected Impact: Medium. This reduces network overhead and allows the server to process data in more efficient, larger chunks, reducing the number of times the processing loop is invoked.

Summary of Optimization Opportunities
ID Optimization Area Type Impact
2.1 Batch DB Writes with UNWIND SyncStream I/O Very High
1.1 Use cyrb53 for getKey() meta-hash TknMiner CPU High
1.2 Optimize cyrb53 for Binary Data SymbolTable CPU High (for binary streams)
3.1 Promote Client-Side Batching Protocol/Client Network Medium

Recommendation:

Implement the UNWIND optimization first. It will provide the biggest performance boost to the entire system's throughput.

Implement the getKey() optimization second. This will speed up the core algorithm's CPU-bound work.

Implement the other optimizations as needed, based on profiling and the specific use cases you are targeting.
