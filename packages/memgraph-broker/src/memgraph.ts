import { variables } from "./environment";
import memgraph from "neo4j-driver";
import { Driver } from "neo4j-driver";
import type { TokenBatch } from "./types";
import pino from "pino";
import { Decoder } from "./decoder";

const logger = pino({ name: "memgraph-manager" });
const decoder = new Decoder(new TextDecoder("utf-8", { fatal: false }));

const {
  MEMGRAPH_PASS,
  MEMGRAPH_URI,
  MEMGRAPH_USER,
  BATCH_MAX_RETRIES,
  BATCH_RETRY_BASE_DELAY_MS,
} = variables;

export const memgraphDriver = memgraph.driver(
  MEMGRAPH_URI,
  memgraph.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASS),
  {
    // Optimize for concurrent connections
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 30000,
    maxTransactionRetryTime: 15000,
  }
);

export class MemgraphManager {
  private driver: Driver;
  private readonly processingMetrics = new Map<string, number>();

  constructor(driver: Driver) {
    this.driver = driver;
  }

  async initializeSession(sessionId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.executeWrite(async (tx) => {
        await tx.run(CREATE_SESSION_QUERY, { sessionId });
      });
      logger.info({ sessionId }, "Session initialized");
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to initialize session");
      throw error;
    } finally {
      await session.close();
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.executeWrite(async (tx) => {
        await tx.run(CLOSE_SESSION_QUERY, { sessionId });
      });
      logger.info({ sessionId }, "Session closed");
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to close session");
      throw error;
    } finally {
      await session.close();
    }
  }

  async processBatch(batch: TokenBatch, sessionId: string): Promise<void> {
    const batchId = `${sessionId}-${performance.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const startTime = performance.now();

    // Track concurrent processing
    const currentProcessing = this.processingMetrics.get(sessionId) || 0;
    this.processingMetrics.set(sessionId, currentProcessing + 1);

    const maxRetries = BATCH_MAX_RETRIES;
    let attempt = 0;

    while (attempt <= maxRetries) {
      const session = this.driver.session();

      try {
        // Convert tokens to include buffer as integer array for storage
        const tokensWithArray = batch.tokens.map((token) => ({
          ...token,
          bytes: Array.from(token.buffer),
        }));

        await session.executeWrite(async (tx) => {
          // Process tokens and observations in parallel within the transaction
          const [tokensResult, observationsResult] = await Promise.all([
            tx.run(CREATE_TOKENS_QUERY, {
              tokens: tokensWithArray,
              sessionId,
            }),
            tx.run(CREATE_OBSERVATIONS_QUERY, {
              tokens: tokensWithArray,
              sessionId,
            }),
          ]);

          logger.debug(
            {
              batchId,
              tokenCount: batch.tokens.length,
              tokensCreated:
                tokensResult.summary.counters.updates().nodesCreated,
              observationsCreated:
                observationsResult.summary.counters.updates()
                  .relationshipsCreated,
              processingTime: performance.now() - startTime,
              attempt: attempt + 1,
            },
            "Batch processed successfully"
          );
        });

        // Use decoder only for logging (sample first few tokens to avoid overwhelming logs)
        const sampleTokens = batch.tokens.slice(0, 3);
        logger.debug(
          {
            batchId,
            tokenCount: batch.tokens.length,
            sampleTokens: sampleTokens
              .map((t) => decoder.decodeToken(t.buffer))
              .join("|"),
            processingTime: performance.now() - startTime,
            attempt: attempt + 1,
          },
          "Processed token batch"
        );

        // Success - break out of retry loop
        break;
      } catch (error: any) {
        attempt++;

        // Check if this is a retriable transaction conflict
        const isRetriable =
          error?.code?.includes("TransientError") ||
          error?.retriable === true ||
          error?.message?.includes("conflicting transactions");

        if (isRetriable && attempt <= maxRetries) {
          // Exponential backoff with jitter
          const baseDelay =
            Math.pow(2, attempt - 1) * BATCH_RETRY_BASE_DELAY_MS;
          const jitter = Math.random() * (BATCH_RETRY_BASE_DELAY_MS / 2); // Add up to half base delay as jitter
          const delay = baseDelay + jitter;

          logger.warn(
            {
              error: error.message,
              batchId,
              tokenCount: batch.tokens.length,
              attempt,
              maxRetries,
              retryDelay: delay,
              processingTime: performance.now() - startTime,
              sessionId,
            },
            `Transaction conflict detected, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // Non-retriable error or max retries exceeded
          logger.error(
            {
              error,
              batchId,
              tokenCount: batch.tokens.length,
              processingTime: performance.now() - startTime,
              sessionId,
              attempt,
              isRetriable,
            },
            attempt > maxRetries
              ? `Failed to process batch after ${maxRetries} retries`
              : "Failed to process batch with non-retriable error"
          );
          throw error;
        }
      } finally {
        await session.close();
      }
    }

    // Update processing metrics
    const finalProcessingCount = this.processingMetrics.get(sessionId) || 1;
    if (finalProcessingCount <= 1) {
      this.processingMetrics.delete(sessionId);
    } else {
      this.processingMetrics.set(sessionId, finalProcessingCount - 1);
    }
  }

  getProcessingStats(): Record<string, number> {
    return Object.fromEntries(this.processingMetrics);
  }
}

const CREATE_SESSION_QUERY = `
  MERGE (session:Session {id: $sessionId})
  ON CREATE SET 
    session.timestamp_created = timestamp(),
    session.timestamp_last_seen = timestamp(),
    session.status = 'active'
  `;

const CLOSE_SESSION_QUERY = `
  MATCH (session:Session {id: $sessionId})
  SET session.status = 'closed',
    session.timestamp_last_seen = timestamp()
  `;

const CREATE_TOKENS_QUERY = `
  UNWIND $tokens as tokenData
  MERGE (t:Token {bytes: tokenData.bytes})
  ON CREATE SET 
    t.timestamp_created = timestamp(),
    t.timestamp_last_seen = timestamp()
  ON MATCH SET 
    t.timestamp_last_seen = timestamp()
  `;

const CREATE_OBSERVATIONS_QUERY = `
  MATCH (session:Session {id: $sessionId})
  UNWIND $tokens as tokenData
  MATCH (t:Token {bytes: tokenData.bytes})
  MERGE (t)-[r:OBSERVED {session_index: tokenData.sessionIndex}]->(session)
  ON CREATE SET 
    r.timestamp_observed = tokenData.timestamp,
    r.first_observed = timestamp(),
    r.last_observed = timestamp()
  ON MATCH SET 
    r.timestamp_observed = tokenData.timestamp,
    r.last_observed = timestamp()
  `;
