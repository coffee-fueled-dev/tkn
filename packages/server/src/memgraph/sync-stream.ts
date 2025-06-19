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
    let txCounter = 0;

    hello.syncStream.debug("Opened Neo4j session and transaction");

    try {
      while (this.canProcessTokenPair() && txCounter < 501) {
        await this.processTokenPair(tx);
        txCounter++;
      }

      hello.syncStream.debug("Committing transaction, txCounter:", {
        txCounter,
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

  private canProcessTokenPair(): boolean {
    return this.tokenBuffer.length >= 2;
  }

  private async processTokenPair(tx: any): Promise<void> {
    const tkn1 = this.tokenBuffer.shift()!;
    const tkn2 = this.tokenBuffer[0]!;

    const tokenData = this.prepareTokenData(tkn1, tkn2);

    hello.syncStream.debug("Token pair values:", tokenData.logData);

    await this.storeDictionaryEntries(tx, tokenData.valueMappings);
    await this.storeTokenRelationship(tx, tokenData);
    hello.syncStream.debug("Token pair processed, incrementing txCounter");
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

  private async storeDictionaryEntries(
    tx: any,
    valueMappings: Array<{ key: string; value: string }>
  ): Promise<void> {
    for (const mapping of valueMappings) {
      if (this.isValidMapping(mapping)) {
        await tx.run(
          `
          MERGE (dict:ValueDictionary:$tid {key: $dictKey})
          ON CREATE SET dict.value = $dictValue
          `,
          {
            tid: this.tenantId,
            dictKey: mapping.key,
            dictValue: mapping.value,
          }
        );
      }
    }
  }

  private isValidMapping(mapping: { key: string; value: string }): boolean {
    return !(
      !mapping.key ||
      mapping.key === "error" ||
      mapping.key === "unavailable"
    );
  }

  private async storeTokenRelationship(tx: any, tokenData: any): Promise<void> {
    await tx.run(
      `
        MERGE (tkn1:Tkn:$tid {value: $tkn1v})
        ON CREATE SET tkn1.lookupKeys = $tkn1k
        MERGE (tkn2:Tkn:$tid {value: $tkn2v})
        ON CREATE SET tkn2.lookupKeys = $tkn2k
        MERGE (tkn1)-[:D1 {idx: $tkn1idx, session: $sid}]->(tkn2)
      `,
      {
        sid: this.sessionId,
        tid: this.tenantId,
        tkn1v: tokenData.tkn1Value,
        tkn2v: tokenData.tkn2Value,
        tkn1k: tokenData.tkn1Data.keys,
        tkn2k: tokenData.tkn2Data.keys,
        tkn1idx: tokenData.tkn1Idx,
      }
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
