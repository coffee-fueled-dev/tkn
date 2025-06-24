import memgraph, { Driver } from "neo4j-driver";
import { QueryResult } from "neo4j-driver";
import pino from "pino";

const logger = pino({ name: "memgraph-operations" });

export interface OperationProps<TPayload> {
  operationName: string;
  payload: TPayload;
  queryFn: (payload: TPayload) => { cypher: string; params: any };
  accessMode?: "READ" | "WRITE";
  sessionOptions?: { fetchSize?: number };
  driver: Driver;
}

export const executeOperation = async <TPayload, TResult = QueryResult>({
  operationName,
  payload,
  queryFn,
  accessMode = "WRITE",
  sessionOptions,
  driver,
}: OperationProps<TPayload>): Promise<TResult> => {
  logger.debug({ payload }, `${operationName}`);
  const session = driver.session({
    defaultAccessMode:
      accessMode === "READ" ? memgraph.session.READ : memgraph.session.WRITE,
    ...sessionOptions,
  });

  try {
    const { cypher, params } = queryFn(payload);

    const result = await (accessMode === "READ"
      ? session.executeRead(async (tx) => tx.run(cypher, params))
      : session.executeWrite(async (tx) => tx.run(cypher, params)));

    return result as TResult;
  } catch (error) {
    logger.error(
      { error, payload },
      `Failed to ${operationName.toLowerCase()}`
    );
    throw error;
  } finally {
    await session.close();
  }
};
