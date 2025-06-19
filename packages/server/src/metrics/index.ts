import { hello } from "./logs";
import * as promClient from "prom-client";

const register = new promClient.Registry();

promClient.collectDefaultMetrics({ register });

const throughputCounter = new promClient.Counter({
  name: "component_operation_throughput_total",
  help: "Total number of operations per component",
  labelNames: ["component", "operation"],
  registers: [register],
});

const latencyHistogram = new promClient.Histogram({
  name: "component_operation_latency_seconds",
  help: "Operation latency histogram",
  labelNames: ["component", "operation"],
  buckets: [0.1, 0.5, 1, 2, 5], // buckets in seconds
  registers: [register],
});

const errorCounter = new promClient.Counter({
  name: "component_operation_errors_total",
  help: "Total number of operation errors",
  labelNames: ["component", "operation"],
  registers: [register],
});

const dependencyCounter = new promClient.Counter({
  name: "component_dependency_calls_total",
  help: "Total number of dependency calls",
  labelNames: ["component", "dependency"],
  registers: [register],
});

const connectionGauge = new promClient.Gauge({
  name: "active_connections_total",
  help: "Number of active client connections",
  registers: [register],
});

export function recordOperation(
  component: string,
  operation: string,
  latency: number,
  error?: boolean,
  dependencies?: string[]
): void {
  throughputCounter.labels(component, operation).inc();
  latencyHistogram.labels(component, operation).observe(latency / 1000); // Seconds

  if (error) {
    errorCounter.labels(component, operation).inc();
    hello.throughput.error(`Operation error in ${component}:${operation}`, {
      component,
      operation,
      latency: `${latency}ms`,
    });
  }

  if (dependencies) {
    dependencies.forEach((dep) => {
      dependencyCounter.labels(component, dep).inc();
    });
  }
}

export function updateConnectionCount(count: number): void {
  connectionGauge.set(count);
}

export function incrementConnections(): void {
  connectionGauge.inc();
}

export function decrementConnections(): void {
  connectionGauge.dec();
}

export async function getMetrics(): Promise<string> {
  return await register.metrics();
}

export function createMetricsHandler() {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname === "/metrics") {
      const metrics = await getMetrics();
      return new Response(metrics, {
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Not Found", { status: 404 });
  };
}

export { register };

hello.server.debug("Metrics system initialized", {
  defaultMetricsEnabled: true,
  scrapeEndpoint: "/metrics",
});
