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

interface BatchedToken {
  token: OutputToken;
  tokenValue: string;
  lookupKeys: string;
  valueMappings: Array<{ key: string; value: string }>;
  callback: (error: Error | null) => void;
}

export class MemgraphManager {
  private sessionId: string;
  private tenantId: string;
  private driver: Driver;
  private symbolTable?: SymbolTable;
  private monitor?: any; // ProcessMonitor reference
  private lastTokenValue: string | null = null;
  private sequenceIndex = 0;
  private sessionNodeCreated = false;

  // Batch processing configuration
  private readonly batchSize = 200; // Process up to 200 tokens at once
  private readonly batchTimeoutMs = 100; // Or timeout after 100ms

  // Transaction queue to serialize operations
  private operationQueue: QueuedOperation[] = [];
  private isProcessing = false;
  private batchTimeout: any = null;

  constructor(
    sessionId: string,
    driver: Driver,
    symbolTable?: SymbolTable,
    monitor?: any
  ) {
    this.sessionId = sessionId;
    this.tenantId = sessionId; // Use sessionId as tenantId for now
    this.driver = driver;
    this.symbolTable = symbolTable;
    this.monitor = monitor;
  }

  /**
   * Create or update the session node
   */
  private async ensureSessionNode(tx: any): Promise<void> {
    if (this.sessionNodeCreated) return;

    await tx.run(
      `
      MERGE (session:Session:$tid {id: $sessionId})
      ON CREATE SET session.timestamp_created = timestamp()
      ON CREATE SET session.status = 'active'
      ON MATCH SET session.timestamp_last_seen = timestamp()
      `,
      {
        sessionId: this.sessionId,
        tid: this.tenantId,
      }
    );

    this.sessionNodeCreated = true;
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
        // If we have enough items or no timeout is set, process immediately
        if (
          this.operationQueue.length >= this.batchSize ||
          !this.batchTimeout
        ) {
          this.processQueue();
        } else if (!this.batchTimeout) {
          // Set a timeout to process smaller batches
          this.batchTimeout = setTimeout(() => {
            this.batchTimeout = null;
            if (!this.isProcessing && this.operationQueue.length > 0) {
              this.processQueue();
            }
          }, this.batchTimeoutMs);
        }
      }
    });
  }

  /**
   * Process the queue in batches to optimize database performance
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    // Clear any pending timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    while (this.operationQueue.length > 0) {
      // Prepare a batch of tokens
      const batch: BatchedToken[] = [];
      const batchSize = Math.min(this.batchSize, this.operationQueue.length);

      for (let i = 0; i < batchSize; i++) {
        const operation = this.operationQueue.shift()!;

        try {
          const tokenValue = this.encodeHashesForStorage(
            operation.token.hashes
          );
          const tokenData = this.createStorageMappings(operation.token);

          batch.push({
            token: operation.token,
            tokenValue,
            lookupKeys: tokenData.keys,
            valueMappings: tokenData.valueMappings,
            callback: operation.callback,
          });
        } catch (error) {
          operation.callback(error as Error);
        }
      }

      if (batch.length > 0) {
        try {
          await this.processBatch(batch);
          // Signal success for all tokens in the batch
          batch.forEach((item) => item.callback(null));
        } catch (error) {
          console.error("Error processing token batch:", error);
          // Signal error for all tokens in the batch
          batch.forEach((item) => item.callback(error as Error));
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Process a batch of tokens using UNWIND for optimal database performance
   */
  private async processBatch(batch: BatchedToken[]): Promise<void> {
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      // Start timing this database operation
      if (this.monitor) {
        this.monitor.startDbBatchTiming();
      }

      await this.ensureSessionNode(tx);

      // Collect all dictionary entries from the batch
      const allDictEntries: Array<{ key: string; value: string }> = [];
      batch.forEach((item) => {
        allDictEntries.push(...item.valueMappings);
      });

      // Remove duplicates by key
      const uniqueDictEntries = allDictEntries.filter(
        (entry, index, self) =>
          index === self.findIndex((e) => e.key === entry.key)
      );

      // Batch insert dictionary entries using UNWIND
      if (uniqueDictEntries.length > 0) {
        await tx.run(
          `
          UNWIND $dictBatch as entry
          MERGE (dict:Dictionary:$tid {key: entry.key})
          ON CREATE SET dict.value = entry.value
          ON CREATE SET dict.timestamp_created = timestamp()
          ON MATCH SET dict.timestamp_last_seen = timestamp()
          `,
          {
            dictBatch: uniqueDictEntries,
            tid: this.tenantId,
          }
        );
      }

      // Prepare batch data for token creation
      const tokenBatch = batch.map((item, index) => ({
        tokenValue: item.tokenValue,
        lookupKeys: item.lookupKeys,
        tokenIdx: item.token.idx,
        sequenceIndex: this.sequenceIndex + index,
        prevTokenValue:
          index === 0 ? this.lastTokenValue : batch[index - 1].tokenValue,
      }));

      // Create all tokens and relationships using UNWIND
      await tx.run(
        `
        MATCH (session:Session:$tid {id: $sessionId})
        
        UNWIND $tokenBatch as tokenData
        
        // Create the token
        MERGE (currTkn:Tkn:$tid {value: tokenData.tokenValue})
        ON CREATE SET currTkn.session_discovered = $sid
        ON CREATE SET currTkn.session_last_seen = $sid
        ON CREATE SET currTkn.timestamp_created = timestamp()
        ON MATCH SET currTkn.session_last_seen = $sid
        ON MATCH SET currTkn.timestamp_last_seen = timestamp()
        
        // Link to session
        MERGE (session)-[:OBSERVED {token_index: tokenData.tokenIdx, timestamp_created: timestamp()}]->(currTkn)
        
        // Create sequence relationship if there's a previous token
        WITH currTkn, tokenData, session
        CALL {
          WITH currTkn, tokenData
          WITH currTkn, tokenData
          WHERE tokenData.prevTokenValue IS NOT NULL
          MATCH (prevTkn:Tkn:$tid {value: tokenData.prevTokenValue})
          MERGE (prevTkn)-[:D1 {session_index: tokenData.tokenIdx, session_id: $sid, timestamp_created: timestamp()}]->(currTkn)
          RETURN currTkn as tkn
          UNION
          WITH currTkn, tokenData
          WHERE tokenData.prevTokenValue IS NULL
          RETURN currTkn as tkn
        }
        
        // Create value relationships
        WITH tkn, tokenData
        WITH tkn, tokenData, split(tokenData.lookupKeys, '|') as keys
        UNWIND range(0, size(keys) - 1) as i
        WITH tkn, keys[i] as key, i
        WHERE key IS NOT NULL AND key <> ''
        MATCH (dict:Dictionary:$tid {key: key})
        MERGE (tkn)-[r:HAS_VALUE]->(dict)
        ON CREATE SET r.order = i
        `,
        {
          tokenBatch,
          sessionId: this.sessionId,
          sid: this.sessionId,
          tid: this.tenantId,
        }
      );

      // Update sequence tracking
      this.lastTokenValue = batch[batch.length - 1].tokenValue;
      this.sequenceIndex += batch.length;

      await tx.commit();

      // End timing and track successful database token persistence (count tokens, not batches)
      if (this.monitor) {
        this.monitor.endDbBatchTiming();
        // Increment by the number of tokens in this batch
        for (let i = 0; i < batch.length; i++) {
          this.monitor.incrementDbTransactions();
        }
      }
    } catch (error) {
      // End timing even on error
      if (this.monitor) {
        this.monitor.endDbBatchTiming();
      }
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Process a single token sequentially (no concurrency conflicts)
   */
  private async processTokenSequentially(token: OutputToken): Promise<void> {
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      await this.ensureSessionNode(tx);

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
      // Create token, link to previous token, and link to session
      await tx.run(
        `
        MATCH (prevTkn:Tkn:$tid {value: $prevTokenValue})
        MATCH (session:Session:$tid {id: $sessionId})
        
        MERGE (currTkn:Tkn:$tid {value: $tokenValue})
        ON CREATE SET currTkn.session_discovered = $sid
        ON CREATE SET currTkn.session_last_seen = $sid
        ON CREATE SET currTkn.timestamp_created = timestamp()
        ON MATCH SET currTkn.session_last_seen = $sid
        ON MATCH SET currTkn.timestamp_last_seen = timestamp()
        
        MERGE (prevTkn)-[:D1 {session_index: $tokenIdx, session_id: $sid, timestamp_created: timestamp()}]->(currTkn)
        MERGE (session)-[:OBSERVED {token_index: $tokenIdx, timestamp_created: timestamp()}]->(currTkn)
        
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
          sessionId: this.sessionId,
          tid: this.tenantId,
        }
      );
    } else {
      // First token - create it and link to session
      await tx.run(
        `
        MATCH (session:Session:$tid {id: $sessionId})
        
        MERGE (tkn:Tkn:$tid {value: $tokenValue})
        ON CREATE SET tkn.session_discovered = $sid
        ON CREATE SET tkn.session_last_seen = $sid
        ON CREATE SET tkn.timestamp_created = timestamp()
        ON MATCH SET tkn.session_last_seen = $sid
        ON MATCH SET tkn.timestamp_last_seen = timestamp()
        
        MERGE (session)-[:OBSERVED {token_index: 0, timestamp_created: timestamp()}]->(tkn)
        
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
          sessionId: this.sessionId,
          tid: this.tenantId,
        }
      );
    }
  }

  /**
   * Mark session as completed
   */
  async markSessionCompleted(): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `
        MATCH (s:Session:$tid {id: $sessionId})
        SET s.status = 'completed'
        SET s.timestamp_completed = timestamp()
        `,
        {
          sessionId: this.sessionId,
          tid: this.tenantId,
        }
      );
    } finally {
      await session.close();
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
    this.sessionNodeCreated = false;
  }
}
