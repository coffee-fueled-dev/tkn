import pino from "pino";
import { MemgraphManager, memgraphDriver } from "./memgraph";
import { variables } from "./environment";
import type { Token, TokenBatch } from "./types";
import { Decoder } from "./decoder";

const logger = pino({ name: "memgraph-broker" });
const decoder = new Decoder(new TextDecoder("utf-8", { fatal: false }));

const { BATCH_SIZE } = variables;

const { BATCH_TIMEOUT_MS } = variables;

export class Broker {
  private readonly memgraphManager: MemgraphManager;
  private readonly tokenBatch: Token[];
  private readonly sessionId: string;
  private inactivityTimer: Timer | null = null;

  constructor(sessionId: string) {
    this.memgraphManager = new MemgraphManager(memgraphDriver);
    this.tokenBatch = [];
    this.sessionId = sessionId;
  }

  pushToBatch(token: Token) {
    const { buffer, sessionId, sessionIndex, timestamp } = token;
    const tokenString = decoder.decodeToken(buffer);

    logger.debug(`Processing token: ${tokenString} for session ${sessionId}`);

    this.tokenBatch.push(token);
    logger.debug(
      `Added token to batch: ${tokenString}, batch size: ${this.tokenBatch.length}`
    );

    if (this.tokenBatch.length >= BATCH_SIZE) {
      const batchToProcess: TokenBatch = {
        tokens: this.tokenBatch.splice(0, BATCH_SIZE),
      };
      logger.info(
        `Processing batch, batch size: ${batchToProcess.tokens.length}`
      );
      this.memgraphManager.processBatch(batchToProcess, this.sessionId);
    }

    this.resetInactivityTimer();
  }

  private resetInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    this.inactivityTimer = setTimeout(() => {
      logger.info(
        `Flushing batch for session ${this.sessionId} due to inactivity`
      );
      this.flushBatch();
    }, BATCH_TIMEOUT_MS);
  }

  async initializeSession() {
    await this.memgraphManager.initializeSession(this.sessionId);
  }

  async closeSession() {
    await this.memgraphManager.closeSession(this.sessionId);
  }

  flushBatch() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    if (this.tokenBatch.length > 0) {
      const batchToProcess: TokenBatch = {
        tokens: [...this.tokenBatch],
      };
      logger.info(
        `Flushing batch, batch size: ${batchToProcess.tokens.length}`
      );
      this.memgraphManager.processBatch(batchToProcess, this.sessionId);
      this.tokenBatch.length = 0; // Clear the array
    }
  }

  getSessionId() {
    return this.sessionId;
  }

  destroy() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    this.flushBatch();
  }
}
