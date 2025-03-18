import { hello } from "./logs";
import { env } from "./env";
import { getPrometheusMetrics } from "./throughput-monitor";

// Create HTTP server for Prometheus metrics
const startMetricsServer = () => {
  const server = Bun.serve({
    port: env.METRICS_PORT,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/metrics") {
        const metrics = await getPrometheusMetrics();
        return new Response(metrics, {
          headers: { "Content-Type": "text/plain" },
        });
      }
      return new Response("Not Found", { status: 404 });
    },
  });

  hello.server.info(
    `Metrics server listening at http://localhost:${server.port}/metrics`
  );

  return { server };
};

export const metricsServer = startMetricsServer();
