/**
 * SyncStream - Token batch processor
 * It processes token pairs and stores them in a Neo4j database.
 */

import { randomUUIDv7 } from "bun";
import { Driver } from "neo4j-driver";
import type { OutputToken } from "../lib/miner";
import { SymbolTable } from "../lib/symbol-table";

import type { HashedValue } from "../lib/cyrb53";

export class SyncStream {
  private tokenBuffer: OutputToken[] = [];
  private sessionId = randomUUIDv7();
  private tenantId: string;
  private driver: Driver;
  private syncing = false;
  private symbolTable?: SymbolTable;

  constructor(tenantId: string, driver: Driver, symbolTable?: SymbolTable) {
    this.tenantId = tenantId;
    this.driver = driver;
    this.symbolTable = symbolTable;
  }

  private encodeHashesForStorage(hashes: HashedValue[]): string {
    return hashes.map((hash) => Buffer.from(hash).toString("base64")).join("|");
  }

  private formatReadableValues(hashes: HashedValue[]): string {
    if (!this.symbolTable) return "Symbol table not available";

    try {
      const originalValues = this.symbolTable.getDataArray(hashes);
      return originalValues
        .map((value) => this.formatSingleValue(value))
        .join(", ");
    } catch (err) {
      return `Error recovering original values: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  private formatSingleValue(value: any): string {
    if (typeof value === "object" && value !== null) {
      try {
        return JSON.stringify(value);
      } catch (e) {
        return `[Complex object: ${Object.prototype.toString.call(value)}]`;
      }
    }

    if (typeof value === "string") {
      return value.length > 100
        ? `"${value.substring(0, 100)}..."`
        : `"${value}"`;
    }

    return String(value);
  }

  private createValueLookupKey(
    value: any,
    index: number,
    hashedValues: HashedValue[]
  ): string {
    if (index < hashedValues.length) {
      return Buffer.from(hashedValues[index]).toString("base64");
    }
    return `fallback_${index}`;
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
        const key = this.createValueLookupKey(value, index, hashes);
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

  process(
    chunk: OutputToken,
    callback: (error?: Error | null) => void = () => {}
  ): void {
    const startTime = performance.now();

    this.tokenBuffer.push(chunk);

    if (this.shouldProcessBatch()) {
      this.processTokenBatch(startTime, callback);
    } else {
      callback();
    }
  }

  private shouldProcessBatch(): boolean {
    return this.tokenBuffer.length >= 2 && !this.syncing;
  }

  private processTokenBatch(
    startTime: number,
    callback: (error?: Error | null) => void
  ): void {
    this.syncing = true;

    this.processBatch()
      .then(() => {
        this.syncing = false;

        callback();
      })
      .catch((err) => {
        this.syncing = false;

        callback(err);
      });
  }

  private async processBatch(): Promise<void> {
    const startTime = performance.now();
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      const batchData = this.prepareBatchData();

      if (batchData.pairBatch.length === 0) {
        await tx.commit();
        return;
      }

      await this.storeDictionaryEntriesBatch(tx, batchData.dictBatch);
      await this.storeTokenRelationshipsBatch(tx, batchData.pairBatch);

      await tx.commit();
    } catch (error) {
      await this.handleTransactionError(tx);
      throw error;
    } finally {
      await session.close();
    }
  }

  private prepareBatchData(): {
    pairBatch: Array<{
      tkn1v: string;
      tkn2v: string;
      tkn1k: string;
      tkn2k: string;
      tkn1idx: number;
    }>;
    dictBatch: Array<{ key: string; value: string }>;
  } {
    const pairBatch: Array<{
      tkn1v: string;
      tkn2v: string;
      tkn1k: string;
      tkn2k: string;
      tkn1idx: number;
    }> = [];
    const dictBatch: Array<{ key: string; value: string }> = [];
    const seenDictKeys = new Set<string>();

    // Process up to 500 token pairs to avoid transaction size limits
    let processedPairs = 0;
    while (this.tokenBuffer.length >= 2 && processedPairs < 500) {
      // Get both tokens before modifying the buffer
      const tkn1 = this.tokenBuffer[0];
      const tkn2 = this.tokenBuffer[1];

      // Skip tokens with empty hashes
      if (
        !tkn1.hashes ||
        tkn1.hashes.length === 0 ||
        !tkn2.hashes ||
        tkn2.hashes.length === 0
      ) {
        console.warn(
          `Skipping token pair with empty hashes: tkn1=${
            tkn1.hashes?.length || 0
          }, tkn2=${tkn2.hashes?.length || 0}`
        );
        this.tokenBuffer.shift();
        continue;
      }

      // Remove the first token (keeping the second for the next pair)
      this.tokenBuffer.shift();

      const tokenData = this.prepareTokenData(tkn1, tkn2);

      // Skip pairs with empty encoded values
      if (!tokenData.tkn1Value || !tokenData.tkn2Value) {
        console.warn(
          `Skipping token pair with empty encoded values: tkn1="${tokenData.tkn1Value}", tkn2="${tokenData.tkn2Value}"`
        );
        continue;
      }

      // Add token pair to batch
      pairBatch.push({
        tkn1v: tokenData.tkn1Value,
        tkn2v: tokenData.tkn2Value,
        tkn1k: tokenData.tkn1Data.keys,
        tkn2k: tokenData.tkn2Data.keys,
        tkn1idx: tokenData.tkn1Idx,
      });

      // Add dictionary entries to batch (deduplicating by key)
      for (const mapping of tokenData.valueMappings) {
        if (this.isValidMapping(mapping) && !seenDictKeys.has(mapping.key)) {
          dictBatch.push(mapping);
          seenDictKeys.add(mapping.key);
        }
      }

      processedPairs++;
    }

    return { pairBatch, dictBatch };
  }

  private async storeDictionaryEntriesBatch(
    tx: any,
    dictBatch: Array<{ key: string; value: string }>
  ): Promise<void> {
    if (dictBatch.length === 0) return;

    console.info(
      `Storing ${dictBatch.length} ValueDictionary entries for tenant ${this.tenantId}`
    );

    await tx.run(
      `
      UNWIND $dictBatch as entry
      MERGE (dict:ValueDictionary:$tid {key: entry.key})
      ON CREATE SET dict.value = entry.value
      `,
      {
        dictBatch,
        tid: this.tenantId,
      }
    );
  }

  private async storeTokenRelationshipsBatch(
    tx: any,
    pairBatch: Array<{
      tkn1v: string;
      tkn2v: string;
      tkn1k: string;
      tkn2k: string;
      tkn1idx: number;
    }>
  ): Promise<void> {
    if (pairBatch.length === 0) return;

    await tx.run(
      `
      UNWIND $pairBatch as pair
      MERGE (tkn1:Tkn:$tid {value: pair.tkn1v})
      ON CREATE SET tkn1.lookupKeys = pair.tkn1k
      MERGE (tkn2:Tkn:$tid {value: pair.tkn2v})
      ON CREATE SET tkn2.lookupKeys = pair.tkn2k
      MERGE (tkn1)-[:D1 {idx: pair.tkn1idx, session: $sid}]->(tkn2)
      
      // Create relationships between tokens and their value dictionaries
      WITH tkn1, tkn2, pair
      CALL {
        WITH tkn1, pair
        WITH tkn1, split(pair.tkn1k, '|') as keys
        UNWIND keys as key
        MATCH (dict:ValueDictionary:$tid {key: key})
        MERGE (tkn1)-[:HAS_VALUE]->(dict)
      }
      CALL {
        WITH tkn2, pair
        WITH tkn2, split(pair.tkn2k, '|') as keys
        UNWIND keys as key
        MATCH (dict:ValueDictionary:$tid {key: key})
        MERGE (tkn2)-[:HAS_VALUE]->(dict)
      }
      `,
      {
        pairBatch,
        sid: this.sessionId,
        tid: this.tenantId,
      }
    );
  }

  private prepareTokenData(tkn1: OutputToken, tkn2: OutputToken) {
    const tkn1Value = this.encodeHashesForStorage(tkn1.hashes);
    const tkn2Value = this.encodeHashesForStorage(tkn2.hashes);
    const tkn1Data = this.createStorageMappings(tkn1.hashes);
    const tkn2Data = this.createStorageMappings(tkn2.hashes);

    // Debug: Log if we have empty values
    if (!tkn1Value || !tkn2Value) {
      console.warn(
        `Empty token values detected: tkn1="${tkn1Value}", tkn2="${tkn2Value}"`
      );
      console.warn(
        `Token hashes: tkn1=${tkn1.hashes.length} hashes, tkn2=${tkn2.hashes.length} hashes`
      );
    }

    return {
      tkn1Value,
      tkn2Value,
      tkn1Data,
      tkn2Data,
      valueMappings: [...tkn1Data.valueMappings, ...tkn2Data.valueMappings],
      logData: {
        token1: {
          encoded: tkn1Value,
          original: this.formatReadableValues(tkn1.hashes),
          lookupKeys: tkn1Data.keys,
        },
        token2: {
          encoded: tkn2Value,
          original: this.formatReadableValues(tkn2.hashes),
          lookupKeys: tkn2Data.keys,
        },
      },
      tkn1Idx: tkn1.idx,
    };
  }

  private isValidMapping(mapping: { key: string; value: string }): boolean {
    return !(
      !mapping.key ||
      mapping.key === "error" ||
      mapping.key === "unavailable"
    );
  }

  private async handleTransactionError(tx: any): Promise<void> {
    await tx.rollback();
  }

  /**
   * Flush remaining tokens in buffer when connection closes
   * Ensures all tokens are processed, including the final one
   */
  async flush(): Promise<void> {
    if (this.tokenBuffer.length === 0) {
      return;
    }

    console.info(
      `Flushing ${this.tokenBuffer.length} remaining tokens for session ${this.sessionId}`
    );

    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      // Process all complete pairs first
      const batchData = this.prepareBatchData();

      if (batchData.pairBatch.length > 0) {
        console.info(
          `Processing ${batchData.pairBatch.length} token pairs during flush`
        );
        await this.storeDictionaryEntriesBatch(tx, batchData.dictBatch);
        await this.storeTokenRelationshipsBatch(tx, batchData.pairBatch);
      }

      // Handle any remaining single token by connecting it to the last processed token
      if (this.tokenBuffer.length === 1) {
        const finalToken = this.tokenBuffer[0];

        // Skip final token if it has empty hashes
        if (!finalToken.hashes || finalToken.hashes.length === 0) {
          console.warn(
            `Skipping final token with empty hashes: ${
              finalToken.hashes?.length || 0
            }`
          );
          this.tokenBuffer = [];
        } else {
          console.info("Processing final single token during flush");
          await this.processFinalTokenWithConnection(tx, finalToken);
          // Clear the buffer
          this.tokenBuffer = [];
        }
      }

      await tx.commit();
      console.info(`Flush completed for session ${this.sessionId}`);
    } catch (error) {
      console.error(`Error during flush for session ${this.sessionId}:`, error);
      await this.handleTransactionError(tx);
      throw error;
    } finally {
      await session.close();
    }
  }

  private async processFinalTokenWithConnection(
    tx: any,
    finalToken: OutputToken
  ): Promise<void> {
    const finalTokenData = this.prepareFinalTokenData(finalToken);

    // Store dictionary entries for the final token
    if (finalTokenData.dictBatch.length > 0) {
      await this.storeDictionaryEntriesBatch(tx, finalTokenData.dictBatch);
    }

    // Store the final token and connect it to the most recently processed token
    await tx.run(
      `
      // First, create or get the final token
      MERGE (finalTkn:Tkn:$tid {value: $finalTokenValue})
      ON CREATE SET finalTkn.lookupKeys = $finalLookupKeys
      
      // Find the token with the highest index from this session
      WITH finalTkn
      MATCH ()-[r:D1 {session: $sid}]->(prevTkn:Tkn:$tid)
      WITH finalTkn, prevTkn, r.idx as idx
      ORDER BY idx DESC
      LIMIT 1
      
      // Create relationship from the previous token to the final token
      MERGE (prevTkn)-[:D1 {idx: $finalIdx, session: $sid}]->(finalTkn)
      
      // Create relationships between final token and its value dictionaries
      WITH finalTkn
      WITH finalTkn, split($finalLookupKeys, '|') as keys
      UNWIND keys as key
      MATCH (dict:ValueDictionary:$tid {key: key})
      MERGE (finalTkn)-[:HAS_VALUE]->(dict)
      `,
      {
        finalTokenValue: finalTokenData.tokenValue,
        finalLookupKeys: finalTokenData.tokenData.keys,
        finalIdx: finalToken.idx,
        sid: this.sessionId,
        tid: this.tenantId,
      }
    );
  }

  /**
   * Get the current buffer length for monitoring
   */
  getBufferLength(): number {
    return this.tokenBuffer.length;
  }

  private prepareFinalTokenData(token: OutputToken): {
    tokenValue: string;
    tokenData: {
      keys: string;
      valueMappings: Array<{ key: string; value: string }>;
    };
    dictBatch: Array<{ key: string; value: string }>;
  } {
    const tokenValue = this.encodeHashesForStorage(token.hashes);
    const tokenData = this.createStorageMappings(token.hashes);
    const dictBatch: Array<{ key: string; value: string }> = [];

    // Add dictionary entries for the final token
    for (const mapping of tokenData.valueMappings) {
      if (this.isValidMapping(mapping)) {
        dictBatch.push(mapping);
      }
    }

    return {
      tokenValue,
      tokenData,
      dictBatch,
    };
  }
}
