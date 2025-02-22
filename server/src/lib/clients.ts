import { env } from "./env";
import neo4j from "neo4j-driver";

const { MEMGRAPH_PASS, MEMGRAPH_URI, MEMGRAPH_USER } = env;

export const driver = neo4j.driver(
  MEMGRAPH_URI,
  neo4j.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASS)
);
