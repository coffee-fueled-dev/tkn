export const variables = {
  MEMGRAPH_URI: process.env.MEMGRAPH_URI ?? "memgraph://localhost:7687",
  MEMGRAPH_USER: process.env.MEMGRAPH_USER ?? "memgraph",
  MEMGRAPH_PASS: process.env.MEMGRAPH_PASS ?? "memgraph",
  MEMGRAPH_DB_NAME: process.env.MEMGRAPH_DB_NAME ?? "memgraph",
  TKN_PORT: process.env.TKN_PORT ? parseInt(process.env.TKN_PORT, 10) : 4000,
  PORT: process.env.TKN_PORT ? parseInt(process.env.TKN_PORT, 10) : 4000,

  // Full connection URLs for clients
  TKN_HTTP_URL:
    process.env.TKN_HTTP_URL ??
    `http://localhost:${
      process.env.TKN_PORT ? parseInt(process.env.TKN_PORT, 10) : 4000
    }`,
  TKN_SOCKET_URL:
    process.env.TKN_SOCKET_URL ??
    `localhost:${
      process.env.TKN_PORT ? parseInt(process.env.TKN_PORT, 10) + 1 : 4001
    }`,

  NODE_ENV:
    (process.env.NODE_ENV as "development" | "production") ?? "development",
} as const;
