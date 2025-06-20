import type { PerformanceData } from "./socket-server";

export class MetricsClient {
  private socket: any = null;
  private connected = false;
  private host: string;
  private port: number;

  constructor(host: string = "localhost", port: number = 5001) {
    this.host = host;
    this.port = port;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      this.socket = await Bun.connect({
        hostname: this.host,
        port: this.port,
        socket: {
          open: () => {
            this.connected = true;
            console.log(
              `📊 Connected to metrics server at ${this.host}:${this.port}`
            );
          },
          close: () => {
            this.connected = false;
            this.socket = null;
            console.log("📊 Disconnected from metrics server");
          },
          error: (socket, error) => {
            console.error("📊 Metrics client error:", error);
            this.connected = false;
            this.socket = null;
          },
          data: () => {
            // Metrics server doesn't send data back
          },
        },
      });
    } catch (error) {
      console.error("📊 Failed to connect to metrics server:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket && this.connected) {
      this.socket.end();
      this.connected = false;
      this.socket = null;
    }
  }

  private send(data: PerformanceData): void {
    if (!this.connected || !this.socket) {
      console.warn("📊 Metrics client not connected, dropping data");
      return;
    }

    try {
      const message = JSON.stringify(data);
      this.socket.write(message);
    } catch (error) {
      console.error("📊 Failed to send metrics data:", error);
    }
  }

  // Convenience methods for different event types
  sessionStart(sessionId: string, data: any = {}): void {
    this.send({
      type: "session_start",
      sessionId,
      timestamp: performance.now(),
      data,
    });
  }

  sessionEnd(sessionId: string, data: any = {}): void {
    this.send({
      type: "session_end",
      sessionId,
      timestamp: performance.now(),
      data,
    });
  }

  batchProcessed(sessionId: string, data: any = {}): void {
    this.send({
      type: "batch_processed",
      sessionId,
      timestamp: performance.now(),
      data,
    });
  }

  transformCompleted(sessionId: string, data: any = {}): void {
    this.send({
      type: "transform_completed",
      sessionId,
      timestamp: performance.now(),
      data,
    });
  }

  dbOperation(sessionId: string, data: any = {}): void {
    this.send({
      type: "db_operation",
      sessionId,
      timestamp: performance.now(),
      data,
    });
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance for easy use
let defaultClient: MetricsClient | null = null;

export function getMetricsClient(): MetricsClient {
  if (!defaultClient) {
    const host = process.env.METRICS_SERVER_HOST || "localhost";
    const port = parseInt(process.env.METRICS_SERVER_PORT || "5001");
    defaultClient = new MetricsClient(host, port);
  }
  return defaultClient;
}

// Auto-connect if enabled
if (process.env.METRICS_ENABLED !== "false") {
  const client = getMetricsClient();
  client.connect().catch(() => {
    console.warn("📊 Failed to auto-connect to metrics server");
  });
}
