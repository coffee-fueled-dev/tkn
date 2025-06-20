import { variables } from "../environment";
import { monitorRegistry } from "../socket-server/monitor";

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

      if (url.pathname === "/metrics") {
        const aggregatedMetrics = monitorRegistry.getAggregatedMetrics();
        return new Response(JSON.stringify(aggregatedMetrics, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/metrics/detailed") {
        const allMetrics = monitorRegistry.getAllMetrics();
        return new Response(JSON.stringify(allMetrics, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/metrics/summary") {
        const aggregated = monitorRegistry.getAggregatedMetrics();
        const summary = {
          status:
            aggregated.bottlenecks.length > 0
              ? "bottleneck_detected"
              : "healthy",
          activeConnections: aggregated.activeConnections,
          totalOperations: aggregated.totalTransforms,
          avgLatency: {
            transform: Math.round(aggregated.avgTransformDuration * 100) / 100,
            memgraph: Math.round(aggregated.avgMemgraphDuration * 100) / 100,
          },
          mergeEfficiency:
            Math.round(aggregated.overallMergeRate * 10000) / 100, // as percentage
          bottlenecks: aggregated.bottlenecks,
        };

        return new Response(JSON.stringify(summary, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
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
