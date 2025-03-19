/**
 * SyncStream - Token batch processor
 * It processes token pairs and stores them in a Neo4j database.
 */

import { randomUUIDv7 } from "bun";
import { Driver } from "neo4j-driver";
import { hello } from "./logs";
import type { OutputToken } from "./tkn-miner";
import { SymbolTable } from "./symbol-table/symbol-table";
import { createHash } from "crypto";
import { recordOperation } from "./metrics-server";
import type { HashedValue } from "./symbol-table/hash-algorithms";

export class SyncStream {
  private tokenBuffer: OutputToken[] = [];
  private sessionId = randomUUIDv7();
  private tenantId: string;
  private driver: Driver;
  private syncing = false; // flag to prevent concurrent processing
  private symbolTable?: SymbolTable; // Optional symbol table for decoding values

  constructor(tenantId: string, driver: Driver, symbolTable?: SymbolTable) {
    this.tenantId = tenantId;
    this.driver = driver;
    this.symbolTable = symbolTable;
    hello.syncStream.info(
      `SyncStream initialized for tenant ${this.tenantId} with sessionId ${this.sessionId}`
    );
  }

  /**
   * Convert HashedValue array to a string representation for storage
   */
  private hashesToString(hashes: HashedValue[]): string {
    return hashes.map((hash) => Buffer.from(hash).toString("base64")).join("|");
  }

  /**
   * Try to decode hashed values to their original data if symbol table is available
   * and format them for readable logging
   */
  private formatOriginalValues(hashes: HashedValue[]): string {
    if (!this.symbolTable) return "Symbol table not available";

    try {
      const originalValues = this.symbolTable.getDataArray(hashes);
      // Format the original values as a readable string
      return originalValues
        .map((value) => {
          // Handle different value types appropriately
          if (typeof value === "object" && value !== null) {
            try {
              return JSON.stringify(value);
            } catch (e) {
              return `[Complex object: ${Object.prototype.toString.call(
                value
              )}]`;
            }
          } else if (typeof value === "string") {
            // For strings, show them directly but with quotes and truncate if too long
            return value.length > 100
              ? `"${value.substring(0, 100)}..."`
              : `"${value}"`;
          } else {
            // For other primitives, convert to string
            return String(value);
          }
        })
        .join(", ");
    } catch (err) {
      // If we can't recover the original values, return an error message
      hello.syncStream.debug("Could not recover original values:", err);
      return `Error recovering original values: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  /**
   * Creates a compact hash key for original data lookup
   * @param value The original value to create a key for
   * @returns A short hash string that can be used as a lookup key
   */
  private createLookupKey(value: any): string {
    // Convert any value to a string
    let stringValue: string;

    if (typeof value === "object" && value !== null) {
      try {
        stringValue = JSON.stringify(value);
      } catch (e) {
        stringValue = String(value);
      }
    } else {
      stringValue = String(value);
    }

    // Create a short MD5 hash (good enough for lookup purposes)
    return createHash("md5").update(stringValue).digest("hex");
  }

  /**
   * Process original values to store in lookup dictionary
   * Returns hash keys for the values instead of the values themselves
   */
  private processOriginalValuesForStorage(hashes: HashedValue[]): {
    keys: string;
    valueMappings: Array<{ key: string; value: string }>;
  } {
    if (!this.symbolTable) return { keys: "unavailable", valueMappings: [] };

    try {
      const originalValues = this.symbolTable.getDataArray(hashes);
      const lookupEntries: Array<{ key: string; value: string }> = [];

      // Create lookup keys for each value
      const lookupKeys = originalValues.map((value) => {
        const key = this.createLookupKey(value);
        // Store each value with its key for the dictionary
        let stringValue: string;

        try {
          stringValue =
            typeof value === "object" && value !== null
              ? JSON.stringify(value)
              : String(value);
        } catch (e) {
          stringValue = `[Unstringifiable object: ${Object.prototype.toString.call(
            value
          )}]`;
        }

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
        err
      );
      return { keys: "error", valueMappings: [] };
    }
  }

  /**
   * Process a token chunk
   */
  process(
    chunk: OutputToken,
    callback: (error?: Error | null) => void = () => {}
  ): void {
    const startTime = performance.now();
    // Log the received token
    hello.syncStream.debug("Received token chunk:", {
      hashCount: chunk.hashes.length,
      idx: chunk.idx,
    });

    // Add the incoming token to our buffer
    this.tokenBuffer.push(chunk);
    hello.syncStream.debug("Token buffer length:", this.tokenBuffer.length);

    // If we have at least two tokens and are not already processing, process them
    if (this.tokenBuffer.length >= 2 && !this.syncing) {
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
          hello.syncStream.error("Error during batch syncing", err);
          recordOperation(
            "sync-stream",
            "batch-processing",
            performance.now() - startTime,
            true,
            ["neo4j"]
          );
          callback(err);
        });
    } else {
      recordOperation(
        "sync-stream",
        "token-buffered",
        performance.now() - startTime
      );
      callback();
    }
  }

  private async processBatch(): Promise<void> {
    const startTime = performance.now();
    const session = this.driver.session();
    const tx = session.beginTransaction();
    let txCounter = 0;
    hello.syncStream.debug("Opened Neo4j session and transaction");

    try {
      while (this.tokenBuffer.length >= 2 && txCounter < 501) {
        const tkn1 = this.tokenBuffer.shift()!;
        const tkn2 = this.tokenBuffer[0]!; // Peek at the next token.

        // Convert hashes to string representation for storage
        const tkn1Value = this.hashesToString(tkn1.hashes);
        const tkn2Value = this.hashesToString(tkn2.hashes);

        // Get lookup keys and value mappings for the dictionary
        const tkn1Data = this.processOriginalValuesForStorage(tkn1.hashes);
        const tkn2Data = this.processOriginalValuesForStorage(tkn2.hashes);

        // Format original values as human-readable strings for logging
        const originalTkn1String = this.formatOriginalValues(tkn1.hashes);
        const originalTkn2String = this.formatOriginalValues(tkn2.hashes);

        // Log both encoded and readable original values
        hello.syncStream.debug("Token pair values:", {
          token1: {
            encoded: tkn1Value,
            original: originalTkn1String,
            lookupKeys: tkn1Data.keys,
          },
          token2: {
            encoded: tkn2Value,
            original: originalTkn2String,
            lookupKeys: tkn2Data.keys,
          },
        });

        // Process each value mapping to create dictionary entries
        for (const mapping of [
          ...tkn1Data.valueMappings,
          ...tkn2Data.valueMappings,
        ]) {
          // Skip invalid mappings
          if (
            !mapping.key ||
            mapping.key === "error" ||
            mapping.key === "unavailable"
          )
            continue;

          // Add dictionary entry in the same transaction
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

        // Store tokens with lookup keys instead of original values
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
            tkn1v: tkn1Value,
            tkn2v: tkn2Value,
            tkn1k: tkn1Data.keys,
            tkn2k: tkn2Data.keys,
            tkn1idx: tkn1.idx,
          }
        );
        hello.syncStream.debug("Token pair processed, incrementing txCounter");
        txCounter++;
      }
      hello.syncStream.debug("Committing transaction, txCounter:", txCounter);
      await tx.commit();
      recordOperation(
        "neo4j",
        "transaction-committed",
        performance.now() - startTime,
        false,
        ["sync-stream"]
      );
    } catch (error) {
      hello.syncStream.error("Transaction failed, rolling back", error);
      await tx.rollback();
      recordOperation(
        "neo4j",
        "transaction-failed",
        performance.now() - startTime,
        true,
        ["sync-stream"]
      );
      throw error;
    } finally {
      hello.syncStream.debug("Closing Neo4j session");
      await session.close();
    }
  }
}
