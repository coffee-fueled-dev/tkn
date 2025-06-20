import type { TCPSocket } from "bun";

export interface BatchItem {
  data: string | Uint8Array;
}

export interface TknClientOptions {
  host?: string;
  port?: number;
  httpUrl?: string; // Full HTTP URL for replay
  socketUrl?: string; // Socket connection string (host:port)
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export class TknClient {
  private socket: TCPSocket | null = null;
  private options: Required<TknClientOptions>;
  private connected = false;
  private ready = false; // New: tracks if server is ready
  private onConnect: () => void;
  private onDisconnect: () => void;
  private onError: (error: Error) => void;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;

  constructor(options: TknClientOptions = {}) {
    // Parse socket URL from environment or construct from host/port
    const defaultSocketUrl = process.env.TKN_SOCKET_URL || "localhost:4001";
    const defaultHttpUrl = process.env.TKN_HTTP_URL || "http://localhost:4000";

    // If socketUrl is provided, parse host and port from it
    const socketUrl = options.socketUrl || defaultSocketUrl;
    const [socketHost, socketPortStr] = socketUrl.split(":");
    const socketPort = parseInt(socketPortStr, 10);

    this.options = {
      host: options.host || socketHost,
      port: options.port || socketPort,
      httpUrl: options.httpUrl || defaultHttpUrl,
      socketUrl: socketUrl,
      onConnect: options.onConnect || (() => {}),
      onDisconnect: options.onDisconnect || (() => {}),
      onError:
        options.onError || ((err) => console.error("TKN Client Error:", err)),
    };
    this.onConnect = this.options.onConnect;
    this.onDisconnect = this.options.onDisconnect;
    this.onError = this.options.onError || (() => {});
  }

  /**
   * Connect to the TKN server and wait for ready signal
   */
  async connect(): Promise<void> {
    if (this.connected) {
      throw new Error("Client is already connected");
    }

    return new Promise((resolve, reject) => {
      try {
        // Set up ready promise
        this.readyPromise = new Promise((readyResolve) => {
          this.readyResolve = readyResolve;
        });

        const socketPromise = Bun.connect({
          hostname: this.options.host,
          port: this.options.port,
          socket: {
            open: (socket) => {
              this.socket = socket;
              this.connected = true;
              this.onConnect();

              // Wait for ready signal before resolving connect
              this.readyPromise!.then(() => {
                resolve();
              });
            },
            close: (socket) => {
              this.connected = false;
              this.ready = false;
              this.socket = null;
              this.readyPromise = null;
              this.readyResolve = null;
              this.onDisconnect();
            },
            error: (socket, error) => {
              this.connected = false;
              this.ready = false;
              this.socket = null;
              this.readyPromise = null;
              this.readyResolve = null;
              this.onError(error);
              reject(error);
            },
            data: (socket, data) => {
              this.handleServerMessage(data);
            },
          },
        });

        // Handle connection promise rejection
        socketPromise.catch((error) => {
          this.onError(error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle messages from the server
   */
  private handleServerMessage(data: Buffer): void {
    try {
      const message = new TextDecoder().decode(data).trim();

      if (message === "READY") {
        this.ready = true;
        if (this.readyResolve) {
          this.readyResolve();
          this.readyResolve = null;
        }
      }
      // Handle other server messages here if needed in the future
    } catch (error) {
      this.onError(new Error(`Failed to parse server message: ${error}`));
    }
  }

  /**
   * Wait for server to be ready (can be called multiple times safely)
   */
  async waitForReady(): Promise<void> {
    if (!this.connected) {
      throw new Error("Client is not connected");
    }

    if (this.ready) {
      return; // Already ready
    }

    if (this.readyPromise) {
      return this.readyPromise;
    }

    throw new Error("No ready promise available");
  }

  /**
   * Send a batch of items to the server
   */
  async sendBatch(items: BatchItem[]): Promise<void> {
    if (!this.connected || !this.socket) {
      throw new Error("Client is not connected");
    }

    if (!this.ready) {
      throw new Error(
        "Server is not ready. Call waitForReady() first or ensure connect() has completed."
      );
    }

    try {
      // Convert items to JSON and send as Uint8Array
      const batchData = JSON.stringify(items);
      const dataBuffer = new TextEncoder().encode(batchData);

      this.socket.write(dataBuffer);
    } catch (error) {
      this.onError(error as Error);
      throw error;
    }
  }

  /**
   * Send a single item (convenience method)
   */
  async sendItem(data: string | Uint8Array): Promise<void> {
    return this.sendBatch([{ data }]);
  }

  /**
   * Send multiple items as separate batch items
   */
  async sendItems(items: (string | Uint8Array)[]): Promise<void> {
    const batch = items.map((data) => ({ data }));
    return this.sendBatch(batch);
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.socket) {
      return;
    }

    this.socket.end();
    this.connected = false;
    this.ready = false;
    this.socket = null;
    this.readyPromise = null;
    this.readyResolve = null;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Check if server is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Get connection info
   */
  getConnectionInfo(): {
    host: string;
    port: number;
    connected: boolean;
    ready: boolean;
  } {
    return {
      host: this.options.host,
      port: this.options.port,
      connected: this.connected,
      ready: this.ready,
    };
  }

  async replay(sessionId: string): Promise<string[]> {
    const url = `${this.options.httpUrl}/replay/${sessionId}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorBody = await response
          .json()
          .catch(() => ({ error: "Unknown error during replay" }));
        throw new Error(
          `Replay failed with status ${response.status}: ${errorBody.error}`
        );
      }
      const data = await response.json();
      return data as string[];
    } catch (error) {
      this.onError(error as Error);
      throw error;
    }
  }
}

// Export a convenience function for creating clients
export function createTknClient(options?: TknClientOptions): TknClient {
  return new TknClient(options);
}

// Export the old interface for backward compatibility
export const TknClient_Legacy = {
  connect: () => {
    console.log("Connecting to TKN server...");
  },
};
