import { variables } from "../environment";
import memgraph from "neo4j-driver";
import { randomUUIDv7 } from "bun";
import { Driver } from "neo4j-driver";
import type { OutputToken } from "./miner";
import { SymbolTable } from "./symbol-table";
import type { HashedValue } from "./cyrb53";

const { MEMGRAPH_PASS, MEMGRAPH_URI, MEMGRAPH_USER } = variables;

export const memgraphDriver = memgraph.driver(
  MEMGRAPH_URI,
  memgraph.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASS)
);

interface QueuedOperation {
  token: OutputToken;
  callback: (error: Error | null) => void;
}

export class MemgraphManager {
  private sessionId: string;
  private tenantId: string;
  private driver: Driver;
  private symbolTable?: SymbolTable;
  private lastTokenValue: string | null = null;
  private sequenceIndex = 0;

  // Transaction queue to serialize operations
  private operationQueue: QueuedOperation[] = [];
  private isProcessing = false;

  constructor(sessionId: string, driver: Driver, symbolTable?: SymbolTable) {
    this.sessionId = sessionId;
    this.tenantId = sessionId; // Use sessionId as tenantId for now
    this.driver = driver;
    this.symbolTable = symbolTable;
  }

  private encodeHashesForStorage(hashes: HashedValue[]): string {
    return hashes.map((hash) => Buffer.from(hash).toString("base64")).join("|");
  }

  private createStorageMappings(token: OutputToken): {
    keys: string;
    valueMappings: Array<{ key: string; value: string }>;
  } {
    // If token already has originalData, use it
    if (token.originalData && Array.isArray(token.originalData)) {
      const lookupEntries: Array<{ key: string; value: string }> = [];

      const lookupKeys = token.originalData.map((value, index) => {
        const key = this.createValueLookupKey(index, token.hashes);
        const stringValue = this.safeStringifyValue(value);
        lookupEntries.push({ key, value: stringValue });
        return key;
      });

      return {
        keys: lookupKeys.join("|"),
        valueMappings: lookupEntries,
      };
    }

    // Fallback to symbol table lookup (legacy) - with safe handling
    if (!this.symbolTable) return { keys: "unavailable", valueMappings: [] };

    try {
      const originalValues: any[] = [];
      const lookupEntries: Array<{ key: string; value: string }> = [];
      const validKeys: string[] = [];

      // Safely retrieve each hash individually
      for (let index = 0; index < token.hashes.length; index++) {
        const hash = token.hashes[index];
        try {
          const value = this.symbolTable.getData(hash);
          const key = this.createValueLookupKey(index, token.hashes);
          const stringValue = this.safeStringifyValue(value);

          originalValues.push(value);
          lookupEntries.push({ key, value: stringValue });
          validKeys.push(key);
        } catch (err) {
          const hashKey = Buffer.from(hash).toString("base64");
          console.warn(`Skipping hash not found in symbol table: ${hashKey}`);
          // Skip this hash but continue processing others
        }
      }

      return {
        keys: validKeys.join("|"),
        valueMappings: lookupEntries,
      };
    } catch (err) {
      console.error("Error in createStorageMappings:", err);
      console.error(
        "Hashes that failed lookup:",
        token.hashes.map((h) => Buffer.from(h).toString("base64"))
      );
      console.error("Symbol table size:", this.symbolTable?.size());
      console.error(
        "Symbol table cache stats:",
        this.symbolTable?.getCacheStats()
      );
      return { keys: "error", valueMappings: [] };
    }
  }

  private createValueLookupKey(
    index: number,
    hashedValues: HashedValue[]
  ): string {
    if (index < hashedValues.length) {
      return Buffer.from(hashedValues[index]).toString("base64");
    }
    return `fallback_${index}`;
  }

  private safeStringifyValue(value: any): string {
    try {
      return typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : String(value);
    } catch (e) {
      return `[Unstringifiable object: ${Object.prototype.toString.call(
        value
      )}]`;
    }
  }

  /**
   * Process a token by adding it to the sequential queue.
   * Returns a promise that resolves when the operation is complete.
   */
  async process(token: OutputToken): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!token.hashes || token.hashes.length === 0) {
        console.warn(`Skipping token with empty hashes`);
        return resolve();
      }

      // The callback for the operation queue will resolve/reject the outer promise
      const callback = (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      this.operationQueue.push({ token, callback });

      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the queue sequentially to avoid transaction conflicts
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue.shift()!;

      try {
        await this.processTokenSequentially(operation.token);
        operation.callback(null); // Signal success
      } catch (error) {
        console.error("Error processing token sequentially:", error);
        operation.callback(error as Error); // Signal error
      }
    }

    this.isProcessing = false;
  }

  /**
   * Process a single token sequentially (no concurrency conflicts)
   */
  private async processTokenSequentially(token: OutputToken): Promise<void> {
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      const tokenValue = this.encodeHashesForStorage(token.hashes);
      const tokenData = this.createStorageMappings(token);

      if (tokenData.valueMappings.length > 0) {
        await this.storeDictionaryEntries(tx, tokenData.valueMappings);
      }

      await this.storeTokenWithSequence(
        tx,
        tokenValue,
        tokenData.keys,
        token.idx
      );

      // Update last token for next iteration
      this.lastTokenValue = tokenValue;
      this.sequenceIndex++;

      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  private async storeDictionaryEntries(
    tx: any,
    valueMappings: Array<{ key: string; value: string }>
  ): Promise<void> {
    const validMappings = valueMappings.filter(
      (mapping) =>
        mapping.key && mapping.key !== "error" && mapping.key !== "unavailable"
    );

    if (validMappings.length === 0) return;

    await tx.run(
      `
      UNWIND $valueMappings as entry
      MERGE (dict:Dictionary:$tid {key: entry.key})
      ON CREATE SET dict.value = entry.value
      ON CREATE SET dict.timestamp_created = timestamp()
      ON MATCH SET dict.timestamp_last_seen = timestamp()
      `,
      {
        valueMappings: validMappings,
        tid: this.tenantId,
      }
    );
  }

  private async storeTokenWithSequence(
    tx: any,
    tokenValue: string,
    lookupKeys: string,
    tokenIdx: number
  ): Promise<void> {
    if (this.lastTokenValue) {
      // Create token and link to previous token
      await tx.run(
        `
        MATCH (prevTkn:Tkn:$tid {value: $prevTokenValue})
        
        MERGE (currTkn:Tkn:$tid {value: $tokenValue})
        ON CREATE SET currTkn.session_discovered = $sid
        ON CREATE SET currTkn.session_last_seen = $sid
        ON CREATE SET currTkn.timestamp_created = timestamp()
        ON MATCH SET currTkn.session_last_seen = $sid
        ON MATCH SET currTkn.timestamp_last_seen = timestamp()
        
        MERGE (prevTkn)-[:D1 {session_index: $tokenIdx, session_id: $sid, timestamp_created: timestamp()}]->(currTkn)
        
        WITH currTkn
        WITH currTkn, split($lookupKeys, '|') as keys
        UNWIND range(0, size(keys) - 1) as i
        WITH currTkn, keys[i] as key, i
        MATCH (dict:Dictionary:$tid {key: key})
        MERGE (currTkn)-[r:HAS_VALUE]->(dict)
        ON CREATE SET r.order = i
        `,
        {
          prevTokenValue: this.lastTokenValue,
          tokenValue,
          lookupKeys,
          tokenIdx,
          sid: this.sessionId,
          tid: this.tenantId,
        }
      );
    } else {
      // First token - just create it and tag it with the session ID
      await tx.run(
        `
        MERGE (tkn:Tkn:$tid {value: $tokenValue})
        ON CREATE SET tkn.session_discovered = $sid
        ON CREATE SET tkn.session_last_seen = $sid
        ON CREATE SET tkn.timestamp_created = timestamp()
        ON MATCH SET tkn.session_last_seen = $sid
        ON MATCH SET tkn.timestamp_last_seen = timestamp()
        
        WITH tkn
        WITH tkn, split($lookupKeys, '|') as keys
        UNWIND range(0, size(keys) - 1) as i
        WITH tkn, keys[i] as key, i
        MATCH (dict:Dictionary:$tid {key: key})
        MERGE (tkn)-[r:HAS_VALUE]->(dict)
        ON CREATE SET r.order = i
        `,
        {
          tokenValue,
          lookupKeys,
          sid: this.sessionId,
          tid: this.tenantId,
        }
      );
    }
  }

  /**
   * Get the current sequence index
   */
  getSequenceIndex(): number {
    return this.sequenceIndex;
  }

  /**
   * Get the last token value
   */
  getLastTokenValue(): string | null {
    return this.lastTokenValue;
  }

  /**
   * Get the current queue length (for monitoring)
   */
  getQueueLength(): number {
    return this.operationQueue.length;
  }

  /**
   * Check if currently processing
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * Reset the sequence (for testing or new sessions)
   */
  reset(): void {
    this.lastTokenValue = null;
    this.sequenceIndex = 0;
    this.sessionId = randomUUIDv7();
    this.operationQueue = [];
    this.isProcessing = false;
  }
}
