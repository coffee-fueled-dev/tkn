/**
 * SyncStream - Token batch processor
 * It processes token pairs and stores them in a Neo4j database.
 */

import { randomUUIDv7 } from "bun";
import { Driver } from "neo4j-driver";
import { hello } from "../metrics/logs";
import type { OutputToken } from "../lib/miner";
import { SymbolTable } from "../lib/symbol-table";
import { createHash } from "crypto";
import { recordOperation } from "../metrics";
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
    hello.syncStream.info(
      `SyncStream initialized for tenant ${this.tenantId} with sessionId ${this.sessionId}`
    );
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
      hello.syncStream.debug("Could not recover original values:", {
        error: err instanceof Error ? err.message : String(err),
      });
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

  private createValueLookupKey(value: any): string {
    const stringValue = this.convertToString(value);
    return createHash("md5").update(stringValue).digest("hex");
  }

  private convertToString(value: any): string {
    if (typeof value === "object" && value !== null) {
      try {
        return JSON.stringify(value);
      } catch (e) {
        return String(value);
      }
    }
    return String(value);
  }

  private createStorageMappings(hashes: HashedValue[]): {
    keys: string;
    valueMappings: Array<{ key: string; value: string }>;
  } {
    if (!this.symbolTable) return { keys: "unavailable", valueMappings: [] };

    try {
      const originalValues = this.symbolTable.getDataArray(hashes);
      const lookupEntries: Array<{ key: string; value: string }> = [];

      const lookupKeys = originalValues.map((value) => {
        const key = this.createValueLookupKey(value);
        const stringValue = this.safeStringifyValue(value);
        lookupEntries.push({ key, value: stringValue });
        return key;
      });

      return {
        keys: lookupKeys.join("|"),
        valueMappings: lookupEntries,
      };
    } catch (err) {
      hello.syncStream.error(
        "Error processing original data for storage:",
        { error: err instanceof Error ? err.message : String(err) },
        err instanceof Error ? err : new Error(String(err))
      );
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

    hello.syncStream.debug("Received token chunk:", {
      hashCount: chunk.hashes.length,
      idx: chunk.idx,
    });

    this.tokenBuffer.push(chunk);
    hello.syncStream.debug("Token buffer length:", {
      length: this.tokenBuffer.length,
    });

    if (this.shouldProcessBatch()) {
      this.processTokenBatch(startTime, callback);
    } else {
      this.recordBufferOperation(startTime);
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
    hello.syncStream.debug("Starting batch syncing");

    this.processBatch()
      .then(() => {
        this.syncing = false;
        hello.syncStream.debug("Finished batch syncing");
        recordOperation(
          "sync-stream",
          "batch-processed",
          performance.now() - startTime,
          false,
          ["neo4j"]
        );
        callback();
      })
      .catch((err) => {
        this.syncing = false;
        hello.syncStream.error(
          "Error during batch syncing",
          { sessionId: this.sessionId },
          err instanceof Error ? err : new Error(String(err))
        );
        recordOperation(
          "sync-stream",
          "batch-processing",
          performance.now() - startTime,
          true,
          ["neo4j"]
        );
        callback(err);
      });
  }

  private recordBufferOperation(startTime: number): void {
    recordOperation(
      "sync-stream",
      "token-buffered",
      performance.now() - startTime
    );
  }

  private async processBatch(): Promise<void> {
    const startTime = performance.now();
    const session = this.driver.session();
    const tx = session.beginTransaction();

    hello.syncStream.debug("Opened Neo4j session and transaction");

    try {
      const batchData = this.prepareBatchData();

      if (batchData.pairBatch.length === 0) {
        hello.syncStream.debug("No token pairs to process");
        await tx.commit();
        return;
      }

      hello.syncStream.debug("Processing batch with UNWIND:", {
        tokenPairs: batchData.pairBatch.length,
        dictionaryEntries: batchData.dictBatch.length,
      });

      await this.storeDictionaryEntriesBatch(tx, batchData.dictBatch);
      await this.storeTokenRelationshipsBatch(tx, batchData.pairBatch);

      hello.syncStream.debug("Committing transaction, pairs processed:", {
        pairCount: batchData.pairBatch.length,
      });
      await tx.commit();
      recordOperation(
        "neo4j",
        "transaction-committed",
        performance.now() - startTime,
        false,
        ["sync-stream"]
      );
    } catch (error) {
      await this.handleTransactionError(tx, startTime, error);
      throw error;
    } finally {
      hello.syncStream.debug("Closing Neo4j session");
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
      const tkn1 = this.tokenBuffer.shift()!;
      const tkn2 = this.tokenBuffer[0]!;

      const tokenData = this.prepareTokenData(tkn1, tkn2);

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
      hello.syncStream.debug(
        "Token pair prepared for batch:",
        tokenData.logData
      );
    }

    return { pairBatch, dictBatch };
  }

  private async storeDictionaryEntriesBatch(
    tx: any,
    dictBatch: Array<{ key: string; value: string }>
  ): Promise<void> {
    if (dictBatch.length === 0) return;

    hello.syncStream.debug("Storing dictionary entries with UNWIND:", {
      count: dictBatch.length,
    });

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

    hello.syncStream.debug("Storing token relationships with UNWIND:", {
      count: pairBatch.length,
    });

    await tx.run(
      `
      UNWIND $pairBatch as pair
      MERGE (tkn1:Tkn:$tid {value: pair.tkn1v})
      ON CREATE SET tkn1.lookupKeys = pair.tkn1k
      MERGE (tkn2:Tkn:$tid {value: pair.tkn2v})
      ON CREATE SET tkn2.lookupKeys = pair.tkn2k
      MERGE (tkn1)-[:D1 {idx: pair.tkn1idx, session: $sid}]->(tkn2)
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

  private async handleTransactionError(
    tx: any,
    startTime: number,
    error: any
  ): Promise<void> {
    hello.syncStream.error(
      "Transaction failed, rolling back",
      { sessionId: this.sessionId },
      error instanceof Error ? error : new Error(String(error))
    );
    await tx.rollback();
    recordOperation(
      "neo4j",
      "transaction-failed",
      performance.now() - startTime,
      true,
      ["sync-stream"]
    );
  }
}
