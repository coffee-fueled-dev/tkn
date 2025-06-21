import { memgraphDriver, type MemgraphManager } from "../memgraph";
import type { SymbolTable } from "./symbol-table";

/**
 * Preload symbol table with high-confidence tokens from the database
 * @param symbolTable - The symbol table to preload
 * @param memgraphManager - The memgraph manager instance
 * @param sessionId - Optional session ID to preload session-specific tokens
 */
export async function preloadSymbolTable(
  symbolTable: SymbolTable,
  memgraphManager: MemgraphManager,
  sessionId?: string
): Promise<void> {
  try {
    const startTime = performance.now();

    // Build query based on whether we're preloading for a specific session or globally
    let query: string;
    let queryParams: any = {};

    if (sessionId) {
      // Session-specific preloading: create subgraph projection and run PageRank on it
      // Then get the dictionary mappings for the high-ranking tokens
      query = `
          MATCH (s:Session {id: $sessionId})-[:OBSERVED]->(t:Tkn)
          WITH collect(DISTINCT t) as sessionTokens
          MATCH (n1:Tkn)-[r:D1]->(n2:Tkn)
          WHERE n1 IN sessionTokens AND n2 IN sessionTokens
          WITH sessionTokens, collect(r) as sessionRelationships
          CALL graph.project(sessionTokens, sessionRelationships)
          YIELD subgraph
          CALL pagerank.get(subgraph)
          YIELD node, rank
          WHERE rank > 0.001
          WITH node, rank
          ORDER BY rank DESC
          LIMIT 500
          
          // Now get the dictionary mappings for these high-ranking tokens
          MATCH (node)-[:HAS_VALUE]->(dict:Dictionary)
          RETURN dict.key as hash,
                 dict.value as originalData,
                 rank as score,
                 'session-pagerank' as score_type
          ORDER BY score DESC
        `;
      queryParams.sessionId = sessionId;
      console.info(
        `🔍 Querying session-specific PageRank for session: ${sessionId}...`
      );
    } else {
      // Global preloading: use PageRank to find globally important tokens
      // Then get dictionary mappings for the high-ranking tokens
      query = `
          CALL pagerank.get() 
          YIELD node, rank
          WITH node, rank
          WHERE node:Tkn AND rank > 0.001
          ORDER BY rank DESC
          LIMIT 1000
          
          // Get dictionary mappings for these high-ranking tokens
          MATCH (node)-[:HAS_VALUE]->(dict:Dictionary)
          RETURN dict.key as hash,
                 dict.value as originalData,
                 rank as score,
                 'pagerank' as score_type
          ORDER BY score DESC
        `;
      console.info(`🔍 Querying globally important tokens using PageRank...`);
    }

    const session = memgraphDriver.session();
    const result = await session.run(query, queryParams);

    let preloadedCount = 0;
    const preloadedTokens = new Set<string>();

    for (const record of result.records) {
      const hash = record.get("hash"); // This is the dictionary key (base64 encoded hash)
      const originalData = record.get("originalData"); // This is the dictionary value
      const score = record.get("score");
      const scoreType = record.get("score_type");

      if (hash && originalData && !preloadedTokens.has(hash)) {
        try {
          // Convert hash from base64 string back to Uint8Array format
          const hashBuffer = Buffer.from(hash, "base64");
          const hashArray = new Uint8Array(hashBuffer);

          // Parse the original data if it's JSON stringified
          let parsedData;
          try {
            parsedData = JSON.parse(originalData);
          } catch {
            // If it's not JSON, use as-is
            parsedData = originalData;
          }

          // Preload into symbol table using the proper method
          symbolTable.preloadMapping(hashArray, parsedData);

          preloadedTokens.add(hash);
          preloadedCount++;

          // Log a few examples for debugging
          if (preloadedCount <= 5) {
            const scoreDisplay =
              scoreType === "pagerank"
                ? `Global PageRank: ${score.toFixed(6)}`
                : scoreType === "session-pagerank"
                ? `Session PageRank: ${score.toFixed(6)}`
                : `Score: ${score}`;
            console.info(
              `  📦 Preloaded token: "${parsedData}" (${scoreDisplay})`
            );
          }
        } catch (err) {
          console.warn(`⚠️  Failed to preload token with hash ${hash}:`, err);
        }
      }
    }

    await session.close();

    const endTime = performance.now();
    const duration = endTime - startTime;

    console.info(
      `✅ Preloaded ${preloadedCount} high-confidence tokens in ${duration.toFixed(
        2
      )}ms`
    );

    if (preloadedCount > 5) {
      console.info(`  📊 Symbol table size: ${symbolTable.size()} entries`);
      console.info(`  🎯 Cache stats:`, symbolTable.getCacheStats());
    }
  } catch (error) {
    console.error("Failed to preload symbol table:", error);
    // Don't throw - we want to continue even if preloading fails
  }
}
