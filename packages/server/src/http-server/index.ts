import { variables } from "../environment";

async function handleMetrics(url: URL): Promise<Response> {
  if (url.pathname === "/metrics") {
    const basicMetrics = {
      status: "redis-pubsub",
      message: "Using Redis pub/sub for token processing",
    };
    return new Response(JSON.stringify(basicMetrics, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/metrics/detailed") {
    const detailedMetrics = {
      status: "redis-pubsub",
      message: "Detailed metrics available at memgraph-broker:4002/metrics",
    };
    return new Response(JSON.stringify(detailedMetrics, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/metrics/summary") {
    const summary = {
      status: "redis-pubsub",
      message: "Summary metrics available at memgraph-broker:4002/metrics",
    };

    return new Response(JSON.stringify(summary, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

async function handleReplay(sessionId: string): Promise<Response> {
  return new Response(
    JSON.stringify({
      error: "Replay functionality moved to memgraph-broker service",
      message:
        "Connect to Memgraph Lab at port 3000 to query session data directly",
    }),
    {
      status: 501,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export const startHttpServer = () =>
  Bun.serve({
    port: variables.TKN_PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return new Response("OK", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      if (url.pathname.startsWith("/metrics")) {
        return handleMetrics(url);
      }

      const replayMatch = url.pathname.match(/^\/replay\/([a-zA-Z0-9-]+)$/);
      if (replayMatch) {
        const sessionId = replayMatch[1];
        return handleReplay(sessionId);
      }

      return new Response(
        "TKN Server - Use socket connection for data processing\n\nAvailable endpoints:\n- /health\n- /metrics\n- /metrics/detailed\n- /metrics/summary\n\nNote: Token processing now uses Redis pub/sub architecture",
        {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }
      );
    },
  });
