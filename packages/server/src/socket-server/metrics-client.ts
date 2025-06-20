interface PerformanceEvent {
  type:
    | "session_start"
    | "session_end"
    | "data_ingested"
    | "batch_processed"
    | "transform_completed"
    | "db_operation";
  sessionId: string;
  timestamp: number;
  data: any;
}

export class TknMetricsClient {
  private socket: any = null;
  private connected = false;
  private host: string;
  private port: number;
  private enabled: boolean;

  constructor() {
    this.host = process.env.METRICS_SERVER_HOST || "localhost";
    this.port = parseInt(process.env.METRICS_SERVER_PORT || "5001");
    this.enabled = process.env.METRICS_ENABLED !== "false";

    console.log(
      `📊 Initializing metrics client: ${this.host}:${this.port} (enabled: ${this.enabled})`
    );

    if (this.enabled) {
      this.connect().catch((error) => {
        console.warn(
          `📊 Failed to connect to metrics server at ${this.host}:${this.port} - continuing without metrics`,
          error
        );
        this.enabled = false;
      });
    }
  }

  private async connect(): Promise<void> {
    if (this.connected || !this.enabled) {
      console.log(
        `📊 Skipping connection: connected=${this.connected}, enabled=${this.enabled}`
      );
      return;
    }

    console.log(
      `📊 Attempting to connect to metrics server at ${this.host}:${this.port}...`
    );

    try {
      this.socket = await Bun.connect({
        hostname: this.host,
        port: this.port,
        socket: {
          open: () => {
            this.connected = true;
            console.log(
              `📊 ✅ Successfully connected to metrics server at ${this.host}:${this.port}`
            );
          },
          close: () => {
            console.log(
              `📊 🔌 Disconnected from metrics server at ${this.host}:${this.port}`
            );
            this.connected = false;
            this.socket = null;
          },
          error: (socket, error) => {
            console.error(`📊 ❌ Socket error on metrics connection:`, error);
            this.connected = false;
            this.socket = null;
            this.enabled = false;
          },
          data: () => {
            // Metrics server doesn't send data back
          },
        },
      });
    } catch (error) {
      console.error(
        `📊 ❌ Failed to establish connection to metrics server:`,
        error
      );
      this.enabled = false;
      throw error;
    }
  }

  private send(event: PerformanceEvent): void {
    if (!this.enabled || !this.connected || !this.socket) {
      console.log(
        `📊 ⚠️  Dropping event ${event.type} - not connected (enabled: ${this.enabled}, connected: ${this.connected})`
      );
      return;
    }

    try {
      const message = JSON.stringify(event);
      this.socket.write(message);
      console.log(
        `📊 📤 Sent event: ${event.type} for session ${event.sessionId}`
      );
    } catch (error) {
      console.error(`📊 ❌ Failed to send event ${event.type}:`, error);
      this.enabled = false;
    }
  }

  // Session lifecycle events
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

  // Processing events
  dataIngested(sessionId: string, itemCount: number, totalBytes: number): void {
    this.send({
      type: "data_ingested",
      sessionId,
      timestamp: performance.now(),
      data: {
        itemCount,
        totalBytes,
      },
    });
  }

  batchProcessed(
    sessionId: string,
    batchSize: number,
    processingDuration: number,
    queueLength: number
  ): void {
    this.send({
      type: "batch_processed",
      sessionId,
      timestamp: performance.now(),
      data: {
        batchSize,
        processingDuration,
        queueLength,
      },
    });
  }

  transformCompleted(
    sessionId: string,
    duration: number,
    tokensEmitted: number
  ): void {
    this.send({
      type: "transform_completed",
      sessionId,
      timestamp: performance.now(),
      data: {
        duration,
        tokensEmitted,
      },
    });
  }

  dbOperation(sessionId: string, operation: string, duration: number): void {
    this.send({
      type: "db_operation",
      sessionId,
      timestamp: performance.now(),
      data: {
        operation,
        duration,
      },
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket && this.connected) {
      console.log(
        `📊 🔌 Disconnecting from metrics server at ${this.host}:${this.port}`
      );
      this.socket.end();
      this.connected = false;
      this.socket = null;
    } else {
      console.log(`📊 ℹ️  No active connection to disconnect`);
    }
  }

  isConnected(): boolean {
    return this.connected && this.enabled;
  }
}

// Singleton instance
let metricsClient: TknMetricsClient | null = null;

export function getMetricsClient(): TknMetricsClient {
  if (!metricsClient) {
    metricsClient = new TknMetricsClient();
  }
  return metricsClient;
}
