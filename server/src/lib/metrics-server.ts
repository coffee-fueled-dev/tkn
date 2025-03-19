import { hello } from "./logs";
import { env } from "./env";
import * as promClient from "prom-client";

// Create HTTP server for Prometheus metrics
export const metricsServer = (() => {
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
})();

// Initialize Prometheus metrics
const throughputCounter = new promClient.Counter({
  name: "component_operation_throughput_total",
  help: "Total number of operations per component",
  labelNames: ["component", "operation"],
});

const latencyHistogram = new promClient.Histogram({
  name: "component_operation_latency_seconds",
  help: "Operation latency histogram",
  labelNames: ["component", "operation"],
  buckets: [0.1, 0.5, 1, 2, 5], // buckets in seconds
});

const errorCounter = new promClient.Counter({
  name: "component_operation_errors_total",
  help: "Total number of operation errors",
  labelNames: ["component", "operation"],
});

const dependencyCounter = new promClient.Counter({
  name: "component_dependency_calls_total",
  help: "Total number of dependency calls",
  labelNames: ["component", "dependency"],
});

/**
 * Record an operation for a specific component
 */
export function recordOperation(
  component: string,
  operation: string,
  latency: number,
  error?: boolean,
  dependencies?: string[]
): void {
  // Update Prometheus metrics
  throughputCounter.labels(component, operation).inc();
  latencyHistogram.labels(component, operation).observe(latency / 1000); // Convert to seconds

  if (error) {
    errorCounter.labels(component, operation).inc();
    // Only log errors as they are exceptional conditions
    hello.throughput.error(`Operation error in ${component}:${operation}`);
  }

  if (dependencies) {
    dependencies.forEach((dep) => {
      dependencyCounter.labels(component, dep).inc();
    });
  }
}

/**
 * Get all Prometheus metrics
 */
export async function getPrometheusMetrics(): Promise<string> {
  return await promClient.register.metrics();
}
