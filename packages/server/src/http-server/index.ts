import { variables } from "../environment";

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

      return new Response(
        "TKN Server - Use socket connection for data processing",
        {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }
      );
    },
  });
