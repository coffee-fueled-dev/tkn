import { variables } from "../util/environment";
import memgraph from "neo4j-driver";

const { MEMGRAPH_PASS, MEMGRAPH_URI, MEMGRAPH_USER } = variables;

export const memgraphDriver = memgraph.driver(
  MEMGRAPH_URI,
  memgraph.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASS)
);
