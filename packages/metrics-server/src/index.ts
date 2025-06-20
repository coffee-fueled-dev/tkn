import { startHttpServer } from "./http-server";
import { startSocketServer } from "./socket-server";
import { environment } from "./environment";

console.log("🚀 Starting TKN Metrics Server...");

// Start HTTP server for metrics endpoint and dashboard
const httpServer = startHttpServer();
console.log(
  `📊 Metrics HTTP server listening on port ${environment.HTTP_PORT}`
);
console.log(
  `📈 Prometheus metrics: http://localhost:${environment.HTTP_PORT}/metrics`
);
console.log(
  `🎯 Health check: http://localhost:${environment.HTTP_PORT}/health`
);

// Start Socket server for receiving performance data
const socketServer = startSocketServer();
console.log(
  `🔌 Metrics socket server listening on port ${environment.SOCKET_PORT}`
);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n⏹️  Shutting down metrics server...");
  httpServer.stop();
  socketServer.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n⏹️  Shutting down metrics server...");
  httpServer.stop();
  socketServer.stop();
  process.exit(0);
});
