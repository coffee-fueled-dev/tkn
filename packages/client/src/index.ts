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
  private onConnect: () => void;
  private onDisconnect: () => void;
  private onError: (error: Error) => void;

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
   * Connect to the TKN server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      throw new Error("Client is already connected");
    }

    return new Promise((resolve, reject) => {
      try {
        const socketPromise = Bun.connect({
          hostname: this.options.host,
          port: this.options.port,
          socket: {
            open: (socket) => {
              this.socket = socket;
              this.connected = true;
              this.onConnect();
              resolve();
            },
            close: (socket) => {
              this.connected = false;
              this.socket = null;
              this.onDisconnect();
            },
            error: (socket, error) => {
              this.connected = false;
              this.socket = null;
              this.onError(error);
              reject(error);
            },
            data: (socket, data) => {
              // Server doesn't send data back in our simple protocol
              // But we can handle it if needed in the future
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
   * Send a batch of items to the server
   */
  async sendBatch(items: BatchItem[]): Promise<void> {
    if (!this.connected || !this.socket) {
      throw new Error("Client is not connected");
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
    this.socket = null;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get connection info
   */
  getConnectionInfo(): { host: string; port: number; connected: boolean } {
    return {
      host: this.options.host,
      port: this.options.port,
      connected: this.connected,
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
