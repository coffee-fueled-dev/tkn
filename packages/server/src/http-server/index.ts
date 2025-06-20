import { variables } from "../environment";
import { memgraphDriver } from "../socket-server/memgraph";

async function handleMetrics(url: URL): Promise<Response> {
  if (url.pathname === "/metrics") {
    const basicMetrics = {
      status: "simplified",
      message: "Monitoring simplified to byte counting only",
    };
    return new Response(JSON.stringify(basicMetrics, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/metrics/detailed") {
    const detailedMetrics = {
      status: "simplified",
      message:
        "Detailed metrics temporarily disabled - only byte counting available",
    };
    return new Response(JSON.stringify(detailedMetrics, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.pathname === "/metrics/summary") {
    const summary = {
      status: "simplified",
      message:
        "Summary metrics temporarily disabled - only byte counting available",
    };

    return new Response(JSON.stringify(summary, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
}

async function handleReplay(sessionId: string): Promise<Response> {
  const session = memgraphDriver.session();
  try {
    const result = await session.run(
      `
      MATCH (start_node:Tkn)-[r:D1 {session_id: $sessionId}]->(:Tkn)
      WITH r.session_index AS sidx, start_node
      ORDER BY sidx ASC

      CALL {
          WITH start_node
          MATCH (start_node)-[h1:HAS_VALUE]->(d1:Dictionary)
          WITH d1.value AS value, h1.order AS order
          ORDER BY order ASC
          RETURN COLLECT(value) AS start_dict_values
      }

      WITH sidx, COLLECT(start_dict_values) as token

      RETURN sidx, token
      ORDER BY sidx ASC
      `,
      { sessionId }
    );

    if (result.records.length === 0) {
      return new Response(
        JSON.stringify({ error: "Session not found or contains no data." }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Process the results to reconstruct the original text
    const reconstructedText: string[] = [];

    for (const record of result.records) {
      const sidx = record.get("sidx");
      const tokenData = record.get("token");

      // tokenData is an array of arrays of JSON strings
      // e.g., [["{"data":"T"}", "{"data":"h"}"]]
      if (tokenData && tokenData.length > 0 && tokenData[0].length > 0) {
        const tokenChars: string[] = [];

        for (const jsonString of tokenData[0]) {
          try {
            const parsed = JSON.parse(jsonString);
            if (parsed && typeof parsed.data === "string") {
              tokenChars.push(parsed.data);
            }
          } catch (e) {
            console.error(`Failed to parse token data: ${jsonString}`, e);
          }
        }

        // Join all characters from this token
        reconstructedText.push(tokenChars.join(""));
      }
    }

    // Return the reconstructed text as an array of strings (one per token)
    return new Response(JSON.stringify(reconstructedText), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`Replay error for session ${sessionId}:`, error);
    return new Response(
      JSON.stringify({ error: "Failed to process replay request." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  } finally {
    await session.close();
  }
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
        "TKN Server - Use socket connection for data processing\n\nAvailable endpoints:\n- /health\n- /metrics\n- /metrics/detailed\n- /metrics/summary",
        {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }
      );
    },
  });
