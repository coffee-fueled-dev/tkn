import { variables } from "../environment";
import memgraph from "neo4j-driver";
import { Driver, type Transaction } from "neo4j-driver";
import type { OutputToken } from "./miner";

const { MEMGRAPH_PASS, MEMGRAPH_URI, MEMGRAPH_USER } = variables;

export const memgraphDriver = memgraph.driver(
  MEMGRAPH_URI,
  memgraph.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASS)
);

interface QueuedOperation {
  token: OutputToken;
  callback: (error: Error | null, outputToken: OutputToken) => void;
}

export class MemgraphManager {
  private sessionId: string;
  private tenantId: string;
  private driver: Driver;
  private operationQueue: QueuedOperation[] = [];
  private sessionNodeCreated = false;

  constructor(sessionId: string, driver: Driver) {
    this.sessionId = sessionId;
    this.tenantId = sessionId; // Use sessionId as tenantId for now
    this.driver = driver;
  }

  async ensureSessionNode(tx: Transaction): Promise<void> {
    if (this.sessionNodeCreated) return;

    await tx.run(
      `
      MERGE (session:Session:$tid {id: $sessionId})
      ON CREATE SET session.timestamp_created = timestamp()
      ON CREATE SET session.status = 'active'
      ON MATCH SET session.timestamp_last_seen = timestamp()
      `,
      {
        sessionId: this.sessionId,
        tid: this.tenantId,
      }
    );

    this.sessionNodeCreated = true;
  }

  enqueue(token: OutputToken): void {
    this.operationQueue.push({ token, callback: () => {} });
  }

  async publishBatch(batchSize: number): Promise<void> {
    const batch = this.operationQueue.splice(0, batchSize);
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      await tx.run(INSERT_TOKEN_BATCH_QUERY, {
        tid: this.tenantId,
        sid: this.sessionId,
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
    }
  }
}
const INSERT_TOKEN_BATCH_QUERY = `
MERGE (session:Session:$tid {id: $sessionId})

UNWIND $tokenBatch as tokenData

MERGE (currTkn:Tkn:$tid {value: tokenData.tokenValue})-[:OBSERVED {token_index: tokenData.sessionIdx, timestamp_created: timestamp()}]->(session)
ON CREATE SET currTkn.session_discovered = $sid
ON CREATE SET currTkn.session_last_seen = $sid
ON CREATE SET currTkn.timestamp_created = timestamp()
ON MATCH SET currTkn.session_last_seen = $sid
ON MATCH SET currTkn.timestamp_last_seen = timestamp()
`;
