import { startHttpServer } from "./http-server";
import { startSocketServer } from "./socket-server";
import { memgraphDriver } from "./socket-server/memgraph";
import { monitorRegistry } from "./socket-server/monitor";

const { shutdown } = (() => {
  const httpServer = startHttpServer();
  const socketServer = startSocketServer();

  console.info(`TKN socket server listening on port ${socketServer.port}`);
  console.info(`Health check: http://localhost:${httpServer.port}/health`);

  // Log metrics every 10 seconds
  const metricsInterval = setInterval(() => {
    const metrics = monitorRegistry.getAggregatedMetrics();
    if (metrics.totalTransforms > 0 || metrics.activeConnections > 0) {
      console.info("📊 Metrics:", {
        activeConnections: metrics.activeConnections,
        totalTransforms: metrics.totalTransforms,
        totalMemgraphOps: metrics.totalMemgraphOps,
        avgTransformDuration:
          Math.round(metrics.avgTransformDuration * 100) / 100,
        avgMemgraphDuration:
          Math.round(metrics.avgMemgraphDuration * 100) / 100,
        mergeEfficiency: Math.round(metrics.overallMergeRate * 10000) / 100, // as percentage
        bottlenecks: metrics.bottlenecks,
      });
    }
  }, 10000);

  const shutdown = () => {
    console.info("Shutting down TKN server...");
    clearInterval(metricsInterval);
    httpServer.stop(true);
    socketServer.stop(true);
    memgraphDriver.close();
    console.info("Server shutdown complete");
  };

  return {
    shutdown,
  };
})();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
