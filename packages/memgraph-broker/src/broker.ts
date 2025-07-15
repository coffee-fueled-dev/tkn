import pino from "pino";
import { MemgraphManager, memgraphDriver } from "./memgraph";
import { variables } from "./environment";
import type { Token, TokenBatch, BatchBin } from "./types";
import { Decoder } from "./decoder";

const logger = pino({ name: "memgraph-broker" });
const decoder = new Decoder(new TextDecoder("utf-8", { fatal: false }));

const { BATCH_SIZE, BATCH_TIMEOUT_MS, BATCH_BINS } = variables;

export class Broker {
  private readonly memgraphManager: MemgraphManager;
  private readonly bins: BatchBin[];
  private readonly sessionId: string;

  constructor(sessionId: string) {
    this.memgraphManager = new MemgraphManager(memgraphDriver);
    this.sessionId = sessionId;

    // Initialize bins
    this.bins = Array.from({ length: BATCH_BINS }, (_, i) => ({
      id: i,
      tokens: [],
      timer: null,
      isProcessing: false,
    }));
  }

  pushToBatch(token: Token) {
    const { buffer, sessionId, sessionIndex, timestamp } = token;
    const tokenString = decoder.decodeToken(buffer);

    logger.debug(`Processing token: ${tokenString} for session ${sessionId}`);

    // Hash token to determine which bin to use
    const binIndex = this.hashToBin(token);
    const bin = this.bins[binIndex];

    bin.tokens.push(token);
    logger.debug(
      `Added token to bin ${binIndex}: ${tokenString}, bin size: ${bin.tokens.length}`
    );

    // Process batch if bin is full
    if (bin.tokens.length >= BATCH_SIZE) {
      this.processBin(bin);
    } else {
      // Reset inactivity timer for this bin
      this.resetBinTimer(bin);
    }
  }

  private hashToBin(token: Token): number {
    // Use session index for consistent distribution within a session
    // This ensures tokens from the same session maintain order within bins
    return token.sessionIndex % BATCH_BINS;
  }

  private resetBinTimer(bin: BatchBin) {
    if (bin.timer) {
      clearTimeout(bin.timer);
    }

    bin.timer = setTimeout(() => {
      logger.info(
        `Flushing bin ${bin.id} for session ${this.sessionId} due to inactivity`
      );
      this.processBin(bin);
    }, BATCH_TIMEOUT_MS);
  }

  private async processBin(bin: BatchBin) {
    if (bin.isProcessing || bin.tokens.length === 0) {
      return;
    }

    // Clear timer
    if (bin.timer) {
      clearTimeout(bin.timer);
      bin.timer = null;
    }

    // Mark as processing and extract tokens
    bin.isProcessing = true;
    const tokensToProcess = bin.tokens.splice(0, bin.tokens.length);

    const batch: TokenBatch = { tokens: tokensToProcess };

    logger.debug(
      `Processing bin ${bin.id}, batch size: ${batch.tokens.length}`
    );

    try {
      // Process asynchronously without awaiting to enable parallelism
      this.memgraphManager.processBatch(batch, this.sessionId).finally(() => {
        bin.isProcessing = false;
        logger.debug(`Bin ${bin.id} processing completed`);
      });
    } catch (error) {
      logger.error(
        { error, binId: bin.id, tokenCount: batch.tokens.length },
        "Failed to process bin"
      );
      bin.isProcessing = false;
    }
  }

  async initializeSession() {
    await this.memgraphManager.initializeSession(this.sessionId);
  }

  async closeSession() {
    await this.memgraphManager.closeSession(this.sessionId);
  }

  async flushAllBins() {
    logger.info(`Flushing all bins for session ${this.sessionId}`);

    // Process all bins in parallel
    const flushPromises = this.bins.map((bin) => {
      if (bin.tokens.length > 0) {
        return this.processBin(bin);
      }
      return Promise.resolve();
    });

    await Promise.all(flushPromises);

    // Wait for all processing to complete
    while (this.bins.some((bin) => bin.isProcessing)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  getSessionId() {
    return this.sessionId;
  }

  getBinStats() {
    return this.bins.map((bin) => ({
      id: bin.id,
      tokenCount: bin.tokens.length,
      isProcessing: bin.isProcessing,
      hasTimer: bin.timer !== null,
    }));
  }

  getPerformanceStats() {
    const totalTokens = this.bins.reduce(
      (sum, bin) => sum + bin.tokens.length,
      0
    );
    const processingBins = this.bins.filter((bin) => bin.isProcessing).length;
    const activeBins = this.bins.filter(
      (bin) => bin.tokens.length > 0 || bin.isProcessing
    ).length;

    return {
      sessionId: this.sessionId,
      totalBins: BATCH_BINS,
      activeBins,
      processingBins,
      totalPendingTokens: totalTokens,
      memgraphProcessingStats: this.memgraphManager.getProcessingStats(),
      binDetails: this.getBinStats(),
    };
  }

  async destroy() {
    // Clear all timers
    this.bins.forEach((bin) => {
      if (bin.timer) {
        clearTimeout(bin.timer);
        bin.timer = null;
      }
    });

    // Flush all remaining tokens
    await this.flushAllBins();
  }
}
