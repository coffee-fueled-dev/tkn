import memgraph, { Integer, QueryResult } from "neo4j-driver";
import { createTokenQuery, type CreateTokenPayload } from "./create-token";
import {
  createSessionQuery,
  type CreateSessionPayload,
} from "./create-session";
import { closeSessionQuery, type CloseSessionPayload } from "./close-session";
import { GetTopTokensPayload, getTopTokensQuery } from "./get-top-tokens";
import { executeOperation } from "./execute-operation";
import {
  GetObservedOrderPayload,
  getObservedOrderQuery,
} from "./get-observed-order";
import {
  CreateTokenBatchPayload,
  createTokenBatchQuery,
} from "./create-token-batch";

export const driver = memgraph.driver(
  "bolt://localhost:7687",
  memgraph.auth.basic("memgraph", "memgraph"),
  {
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 30_000,
    maxTransactionRetryTime: 30_000,
  }
);

const insertToken = async (payload: CreateTokenPayload) => {
  return executeOperation({
    operationName: "Inserting token",
    payload,
    queryFn: createTokenQuery,
    driver,
  });
};

const insertTokenBatch = async (payload: CreateTokenBatchPayload) => {
  return executeOperation({
    operationName: "Inserting token batch",
    payload,
    queryFn: createTokenBatchQuery,
    driver,
  });
};

const createSession = async (payload: CreateSessionPayload) => {
  return executeOperation({
    operationName: "Creating session",
    payload,
    queryFn: createSessionQuery,
    driver,
  });
};

const closeSession = async (payload: CloseSessionPayload) => {
  return executeOperation({
    operationName: "Closing session",
    payload,
    queryFn: closeSessionQuery,
    driver,
  });
};

const getTopTokens = async (payload: GetTopTokensPayload) => {
  return executeOperation<
    GetTopTokensPayload,
    QueryResult<{
      token: Integer[];
      rank: number;
    }>
  >({
    operationName: "Getting session top tokens",
    payload,
    queryFn: getTopTokensQuery,
    driver,
    accessMode: "READ",
    sessionOptions: { fetchSize: 1000 },
  });
};

const getObservedOrder = async (payload: GetObservedOrderPayload) => {
  return executeOperation<
    GetObservedOrderPayload,
    QueryResult<{
      token: Integer[];
    }>
  >({
    operationName: "Getting observed order",
    payload,
    queryFn: getObservedOrderQuery,
    driver,
  });
};

const cleanup = async () => {
  await driver.close();
};

export const memgraphOperations = {
  insertToken,
  insertTokenBatch,
  createSession,
  closeSession,
  getTopTokens,
  getObservedOrder,
  cleanup,
};
