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
  callback: (error: Error | null, token: OutputToken | null) => void;
}

export class MemgraphManager {
  private sessionId = randomUUIDv7();
  private tenantId: string;
  private driver: Driver;
  private symbolTable?: SymbolTable;
  private lastTokenValue: string | null = null;
  private sequenceIndex = 0;

  // Transaction queue to serialize operations
  private operationQueue: QueuedOperation[] = [];
  private isProcessing = false;

  constructor(tenantId: string, driver: Driver, symbolTable?: SymbolTable) {
    this.tenantId = tenantId;
    this.driver = driver;
    this.symbolTable = symbolTable;
  }

  private encodeHashesForStorage(hashes: HashedValue[]): string {
    return hashes.map((hash) => Buffer.from(hash).toString("base64")).join("|");
  }

  private createStorageMappings(hashes: HashedValue[]): {
    keys: string;
    valueMappings: Array<{ key: string; value: string }>;
  } {
    if (!this.symbolTable) return { keys: "unavailable", valueMappings: [] };

    try {
      const originalValues = this.symbolTable.getDataArray(hashes);
      const lookupEntries: Array<{ key: string; value: string }> = [];

      const lookupKeys = originalValues.map((value, index) => {
        const key = this.createValueLookupKey(index, hashes);
        const stringValue = this.safeStringifyValue(value);
        lookupEntries.push({ key, value: stringValue });
        return key;
      });

      return {
        keys: lookupKeys.join("|"),
        valueMappings: lookupEntries,
      };
    } catch (err) {
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
   * Process a token by adding it to the sequential queue
   */
  async process(
    token: OutputToken,
    callback: (error: Error | null, token: OutputToken | null) => void
  ): Promise<void> {
    if (!token.hashes || token.hashes.length === 0) {
      console.warn(`Skipping token with empty hashes`);
      callback(null, token);
      return;
    }

    // Add to queue
    this.operationQueue.push({ token, callback });

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
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
        operation.callback(null, operation.token);
      } catch (error) {
        console.error("Error processing token sequentially:", error);
        operation.callback(error as Error, null);
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
      const tokenData = this.createStorageMappings(token.hashes);

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
      MERGE (dict:ValueDictionary:$tid {key: entry.key})
      ON CREATE SET dict.value = entry.value
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
        // Get or create the previous token
        MATCH (prevTkn:Tkn:$tid {value: $prevTokenValue})
        
        // Create the current token
        MERGE (currTkn:Tkn:$tid {value: $tokenValue})
        ON CREATE SET currTkn.lookupKeys = $lookupKeys
        
        // Create relationship from previous to current
        MERGE (prevTkn)-[:D1 {idx: $tokenIdx, session: $sid}]->(currTkn)
        
        // Link token to its value dictionaries
        WITH currTkn
        WITH currTkn, split($lookupKeys, '|') as keys
        UNWIND keys as key
        MATCH (dict:ValueDictionary:$tid {key: key})
        MERGE (currTkn)-[:HAS_VALUE]->(dict)
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
      // First token - just create it
      await tx.run(
        `
        MERGE (tkn:Tkn:$tid {value: $tokenValue})
        ON CREATE SET tkn.lookupKeys = $lookupKeys
        
        // Link token to its value dictionaries
        WITH tkn
        WITH tkn, split($lookupKeys, '|') as keys
        UNWIND keys as key
        MATCH (dict:ValueDictionary:$tid {key: key})
        MERGE (tkn)-[:HAS_VALUE]->(dict)
        `,
        {
          tokenValue,
          lookupKeys,
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
