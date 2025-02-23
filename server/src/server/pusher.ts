import { Writable } from "stream";
import { randomUUIDv7 } from "bun";
import { Driver } from "neo4j-driver";

// Assume MergedToken is defined somewhere, for example:
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
  }

  _write(
    chunk: MergedToken,
    _: string,
    callback: (error?: Error | null) => void
  ) {
    // Add the incoming token to our buffer.
    this.tokenBuffer.push(chunk);
    // If we have at least two tokens and are not already processing, process them.
    if (this.tokenBuffer.length >= 2 && !this.isProcessing) {
      this.isProcessing = true;
      this.processBatch()
        .then(() => {
          this.isProcessing = false;
          callback();
        })
        .catch((err) => {
          this.isProcessing = false;
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

    try {
      while (this.tokenBuffer.length >= 2 && txCounter < 501) {
        const tkn1 = this.tokenBuffer.shift()!;
        const tkn2 = this.tokenBuffer[0]!; // Peek at the next token.
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
        txCounter++;
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }
}
