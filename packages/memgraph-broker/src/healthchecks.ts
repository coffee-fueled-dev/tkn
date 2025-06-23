import { variables } from "./environment";

const { PORT } = variables;

export async function startHealthchecks() {
  const server = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return new Response("OK", { status: 200 });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return { close: () => server.stop() };
}
