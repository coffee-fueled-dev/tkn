import { variables } from "./environment";
import memgraph from "neo4j-driver";
import { Driver } from "neo4j-driver";
import type { TokenBatch } from "./types";
import pino from "pino";
import { Decoder } from "./decoder";

const logger = pino({ name: "memgraph-manager" });
const decoder = new Decoder(new TextDecoder("utf-8", { fatal: false }));

const { MEMGRAPH_PASS, MEMGRAPH_URI, MEMGRAPH_USER } = variables;

export const memgraphDriver = memgraph.driver(
  MEMGRAPH_URI,
  memgraph.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASS)
);

export class MemgraphManager {
  private driver: Driver;

  constructor(driver: Driver) {
    this.driver = driver;
  }

  async initializeSession(sessionId: string): Promise<void> {
    const session = this.driver.session();
    await session.executeWrite(async (tx) => {
      await tx.run(CREATE_SESSION_QUERY, { sessionId });
    });
    await session.close();
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.driver.session();
    await session.executeWrite(async (tx) => {
      await tx.run(CLOSE_SESSION_QUERY, { sessionId });
    });
    await session.close();
  }

  async processBatch(batch: TokenBatch, sessionId: string): Promise<void> {
    const session = this.driver.session();

    try {
      // Convert tokens to include buffer as integer array for storage
      const tokensWithArray = batch.tokens.map((token) => ({
        ...token,
        bytes: Array.from(token.buffer),
      }));

      await session.executeWrite(async (tx) => {
        await tx.run(CREATE_TOKENS_QUERY, {
          tokens: tokensWithArray,
          sessionId,
        });

        await tx.run(CREATE_OBSERVATIONS_QUERY, {
          tokens: tokensWithArray,
          sessionId,
        });
      });

      // Use decoder only for logging
      logger.debug(
        {
          tokenCount: batch.tokens.length,
          tokenValues: batch.tokens
            .map((t) => decoder.decodeToken(t.buffer))
            .join("|"),
        },
        "Processed token batch"
      );
    } catch (error) {
      logger.error(
        { error, tokenCount: batch.tokens.length },
        "Failed to process batch"
      );
      throw error;
    } finally {
      await session.close();
    }
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
  ON MATCH SET t.timestamp_last_seen = timestamp()
  `;

const CREATE_OBSERVATIONS_QUERY = `
  MATCH (session:Session {id: $sessionId})
  UNWIND $tokens as tokenData
  MATCH (t:Token {bytes: tokenData.bytes})
  MERGE (t)-[r:OBSERVED {session_index: tokenData.sessionIndex}]->(session)
  ON CREATE SET 
    r.timestamp_observed = tokenData.timestamp,
    r.first_observed = timestamp()
  ON MATCH SET 
    r.timestamp_observed = tokenData.timestamp,
    r.last_observed = timestamp()
  `;
