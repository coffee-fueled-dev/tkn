import { environment } from "./environment";
import { prometheusRegister } from "./metrics";

export function startHttpServer() {
  const server = Bun.serve({
    port: environment.HTTP_PORT,
    hostname: "0.0.0.0",

    async fetch(req) {
      const url = new URL(req.url);

      // Prometheus metrics endpoint
      if (url.pathname === "/metrics") {
        const metrics = await prometheusRegister.metrics();
        return new Response(metrics, {
          headers: {
            "Content-Type": prometheusRegister.contentType,
          },
        });
      }

      // Health check endpoint
      if (url.pathname === "/health") {
        return Response.json({
          status: "healthy",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: environment.NODE_ENV,
        });
      }

      // Basic dashboard/info endpoint
      if (url.pathname === "/") {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>TKN Metrics Server</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .endpoint { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
        .endpoint a { text-decoration: none; color: #0066cc; }
        .endpoint a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <h1>🚀 TKN Metrics Server</h1>
    <p>Performance monitoring and metrics collection for TKN tokenization system.</p>
    
    <h2>Available Endpoints:</h2>
    <div class="endpoint">
        <strong><a href="/metrics">/metrics</a></strong> - Prometheus metrics endpoint
    </div>
    <div class="endpoint">
        <strong><a href="/health">/health</a></strong> - Health check endpoint
    </div>
    
    <h2>Configuration:</h2>
    <ul>
        <li><strong>HTTP Port:</strong> ${environment.HTTP_PORT}</li>
        <li><strong>Socket Port:</strong> ${environment.SOCKET_PORT}</li>
        <li><strong>Environment:</strong> ${environment.NODE_ENV}</li>
        <li><strong>Metrics Prefix:</strong> ${environment.PROMETHEUS_PREFIX}</li>
    </ul>
    
    <h2>Integration:</h2>
    <p>Configure Prometheus to scrape metrics from: <code>http://localhost:${environment.HTTP_PORT}/metrics</code></p>
    <p>TKN servers should send performance data to socket: <code>localhost:${environment.SOCKET_PORT}</code></p>
</body>
</html>`;

        return new Response(html, {
          headers: {
            "Content-Type": "text/html",
          },
        });
      }

      // 404 for other paths
      return new Response("Not Found", { status: 404 });
    },
  });

  return {
    stop: () => server.stop(),
    server,
  };
}
