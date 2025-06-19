import * as promClient from "prom-client";

const register = new promClient.Registry();

promClient.collectDefaultMetrics({ register });

// 1. Token Processing Rate (tokens processed vs emitted)
const tokensProcessedCounter = new promClient.Counter({
  name: "tokens_processed_total",
  help: "Total number of tokens processed by the miner",
  registers: [register],
});

const tokensEmittedCounter = new promClient.Counter({
  name: "tokens_emitted_total",
  help: "Total number of tokens emitted by the miner",
  registers: [register],
});

// 2. Batch Item Processing Rate (character-level throughput)
const batchItemsProcessedCounter = new promClient.Counter({
  name: "batch_items_processed_total",
  help: "Total number of individual items processed from batches",
  registers: [register],
});

// 3. I/O Throughput
const networkBytesReceivedCounter = new promClient.Counter({
  name: "network_bytes_received_total",
  help: "Total bytes received from network connections",
  registers: [register],
});

const memgraphBytesWrittenCounter = new promClient.Counter({
  name: "memgraph_bytes_written_total",
  help: "Total bytes written to Memgraph database",
  registers: [register],
});

// Connection tracking
const connectionGauge = new promClient.Gauge({
  name: "active_connections_total",
  help: "Number of active client connections",
  registers: [register],
});

// Simplified recording functions
export function recordTokenProcessed(): void {
  tokensProcessedCounter.inc();
}

export function recordTokenEmitted(): void {
  tokensEmittedCounter.inc();
}

export function recordBatchItemProcessed(): void {
  batchItemsProcessedCounter.inc();
}

export function recordNetworkBytesReceived(bytes: number): void {
  networkBytesReceivedCounter.inc(bytes);
}

export function recordMemgraphBytesWritten(bytes: number): void {
  memgraphBytesWrittenCounter.inc(bytes);
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
