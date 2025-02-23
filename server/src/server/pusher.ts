import { Writable } from "stream";
import { randomUUIDv7 } from "bun";
import { Driver } from "neo4j-driver";
import { hello } from "../lib/logs";

type MergedToken = { buffer: Buffer; idx: number };

export class Pusher extends Writable {
  private tokenBuffer: MergedToken[] = [];
  private sessionId = randomUUIDv7();
  private tenantId: string;
  private driver: Driver;
  private isProcessing = false; // flag to prevent concurrent processing

  constructor(tenantId: string, driver: Driver) {
    super({ objectMode: true });
    this.tenantId = tenantId;
    this.driver = driver;
    hello.pusher.info(
      `Pusher initialized for tenant ${this.tenantId} with sessionId ${this.sessionId}`
    );
  }

  _write(
    chunk: MergedToken,
    _: string,
    callback: (error?: Error | null) => void
  ) {
    // Log the received token
    hello.pusher.debug("Received token chunk:", {
      buffer: chunk.buffer.toString("base64"),
      idx: chunk.idx,
    });
    // Add the incoming token to our buffer.
    this.tokenBuffer.push(chunk);
    hello.pusher.debug("Token buffer length:", this.tokenBuffer.length);

    // If we have at least two tokens and are not already processing, process them.
    if (this.tokenBuffer.length >= 2 && !this.isProcessing) {
      this.isProcessing = true;
      hello.pusher.debug("Starting batch processing");
      this.processBatch()
        .then(() => {
          this.isProcessing = false;
          hello.pusher.debug("Finished batch processing");
          callback();
        })
        .catch((err) => {
          this.isProcessing = false;
          hello.pusher.error("Error during batch processing", err);
          callback(err);
        });
    } else {
      callback();
    }
  }

  private async processBatch(): Promise<void> {
    const session = this.driver.session();
    const tx = session.beginTransaction();
    let txCounter = 0;
    hello.pusher.debug("Opened Neo4j session and transaction");

    try {
      while (this.tokenBuffer.length >= 2 && txCounter < 501) {
        const tkn1 = this.tokenBuffer.shift()!;
        const tkn2 = this.tokenBuffer[0]!; // Peek at the next token.
        hello.pusher.debug("Processing token pair:", {
          tkn1: { buffer: tkn1.buffer.toString("base64"), idx: tkn1.idx },
          tkn2: { buffer: tkn2.buffer.toString("base64"), idx: tkn2.idx },
          txCounter,
        });

        await tx.run(
          `
            MERGE (tkn1:Tkn:$tid {value: $tkn1v})
            MERGE (tkn2:Tkn:$tid {value: $tkn2v})
            MERGE (tkn1)-[:D1 {idx: $tkn1idx, session: $sid}]->(tkn2)
          `,
          {
            sid: this.sessionId,
            tid: this.tenantId,
            tkn1v: tkn1.buffer.toString(),
            tkn2v: tkn2.buffer.toString(),
            tkn1idx: tkn1.idx,
          }
        );
        hello.pusher.debug("Token pair processed, incrementing txCounter");
        txCounter++;
      }
      hello.pusher.debug("Committing transaction, txCounter:", txCounter);
      await tx.commit();
    } catch (error) {
      hello.pusher.error("Transaction failed, rolling back", error);
      await tx.rollback();
      throw error;
    } finally {
      hello.pusher.debug("Closing Neo4j session");
      await session.close();
    }
  }
}
