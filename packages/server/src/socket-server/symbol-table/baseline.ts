import { memgraphDriver } from "../memgraph";
import type { SymbolTable } from "./symbol-table";

export const baseline = {
  bpe: {
    tinyStoriesEnglish,
  },
  pagerank: pagerankHistorical,
};

/**
 * Preload symbol table with BPE baseline tokens to reduce cold start times
 * @param symbolTable - The symbol table to preload
 */
async function tinyStoriesEnglish(symbolTable: SymbolTable): Promise<number> {
  try {
    // Try to import the BPE baseline data
    let baselineData: any = null;

    try {
      // Import the generated BPE baseline
      const bpeModule = await import(
        "../../baseline/tokenizers/tkn_bpe_preload_2048.json"
      );
      baselineData = bpeModule.default || bpeModule;
      console.info(
        "📦 Loading BPE baseline from: src/baseline/tokenizers/tkn_bpe_preload_2048.json"
      );
    } catch (importError) {
      console.info("📝 No BPE baseline file found, skipping BPE preloading");
      return 0;
    }

    // Handle new format: direct hash keys -> token data
    if (typeof baselineData === "object" && !Array.isArray(baselineData)) {
      let preloadedCount = 0;
      for (const [hashKey, tokenInfo] of Object.entries(baselineData)) {
        try {
          // Convert hash from base64 back to Uint8Array
          const hashBuffer = Buffer.from(hashKey, "base64");
          const hashArray = new Uint8Array(hashBuffer);

          // Extract token data
          const tokenData = (tokenInfo as any).data;

          // Preload the token into symbol table
          symbolTable.preloadMapping(hashArray, tokenData);
          preloadedCount++;

          // Log first few tokens for debugging
          if (preloadedCount <= 5) {
            const tokenId = (tokenInfo as any).token_id;
            console.info(
              `  🔤 Preloaded BPE token: "${tokenData}" (id: ${tokenId})`
            );
          }
        } catch (err) {
          console.warn(
            `⚠️  Failed to preload BPE token: ${(tokenInfo as any)?.data}`,
            err
          );
        }
      }

      console.info(
        `✅ Preloaded ${preloadedCount} BPE baseline tokens (cyrb53 compatible)`
      );
      return preloadedCount;
    }

    console.warn("⚠️  Invalid BPE baseline format, skipping");
    return 0;
  } catch (error) {
    console.warn("⚠️  Failed to load BPE baseline:", error);
    return 0;
  }
}

/**
 * Preload symbol table with high-confidence tokens from the database
 * @param symbolTable - The symbol table to preload
 * @param sessionId - Optional session ID to preload session-specific tokens
 */
async function pagerankHistorical(
  symbolTable: SymbolTable,
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
      `✅ Preloaded ${preloadedCount} tokens total in ${duration.toFixed(2)}ms`
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
