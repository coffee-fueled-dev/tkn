/**
 * SyncStream - Token batch processor
 * It processes token pairs and stores them in a Neo4j database.
 */

import { randomUUIDv7 } from "bun";
import { Driver } from "neo4j-driver";
import { hello, sayHello } from "./logs";
import type { OutputToken } from "./tkn-miner";
import type { HashedValue } from "./symbol-table";
import { recordOperation } from "./throughput-monitor";

export class SyncStream {
  private tokenBuffer: OutputToken[] = [];
  private sessionId = randomUUIDv7();
  private tenantId: string;
  private driver: Driver;
  private syncing = false; // flag to prevent concurrent processing

  constructor(tenantId: string, driver: Driver) {
    sayHello();
    this.tenantId = tenantId;
    this.driver = driver;
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
   * Process a token chunk
   */
  process(
    chunk: OutputToken,
    callback: (error?: Error | null) => void = () => {}
  ): void {
    const startTime = performance.now();
    sayHello();
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
        hello.syncStream.debug("Processing token pair:", {
          tkn1: { hashCount: tkn1.hashes.length, idx: tkn1.idx },
          tkn2: { hashCount: tkn2.hashes.length, idx: tkn2.idx },
          txCounter,
        });

        // Convert hashes to string representation for storage
        const tkn1Value = this.hashesToString(tkn1.hashes);
        const tkn2Value = this.hashesToString(tkn2.hashes);

        await tx.run(
          `
            MERGE (tkn1:Tkn:$tid {value: $tkn1v})
            MERGE (tkn2:Tkn:$tid {value: $tkn2v})
            MERGE (tkn1)-[:D1 {idx: $tkn1idx, session: $sid}]->(tkn2)
          `,
          {
            sid: this.sessionId,
            tid: this.tenantId,
            tkn1v: tkn1Value,
            tkn2v: tkn2Value,
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
