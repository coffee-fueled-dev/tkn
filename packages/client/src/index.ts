import type { TCPSocket } from "bun";

export interface BatchItem {
  data: string | Uint8Array;
}

export interface TknClientOptions {
  host?: string;
  port?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export class TknClient {
  private socket: TCPSocket | null = null;
  private options: Required<TknClientOptions>;
  private connected = false;

  constructor(options: TknClientOptions = {}) {
    this.options = {
      host: options.host || "localhost",
      port: options.port || 3001, // Default socket port (TKN_PORT + 1)
      onConnect: options.onConnect || (() => {}),
      onDisconnect: options.onDisconnect || (() => {}),
      onError:
        options.onError || ((err) => console.error("TKN Client Error:", err)),
    };
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
              this.options.onConnect();
              resolve();
            },
            close: (socket) => {
              this.connected = false;
              this.socket = null;
              this.options.onDisconnect();
            },
            error: (socket, error) => {
              this.connected = false;
              this.socket = null;
              this.options.onError(error);
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
          this.options.onError(error);
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
      this.options.onError(error as Error);
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
