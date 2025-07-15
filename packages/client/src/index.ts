import type { TCPSocket } from "bun";

export interface BatchItem {
  data: string;
}

export interface SessionConfig {
  keyGenerator?: string;
  preloader?: string;
}

export interface TknClientOptions {
  host?: string;
  port?: number;
  socketUrl?: string;
  sessionConfig?: SessionConfig;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export class TknClient {
  private socket: TCPSocket | null = null;
  private options: Required<TknClientOptions>;
  private connected = false;
  private ready = false;
  private onConnect: () => void;
  private onDisconnect: () => void;
  private onError: (error: Error) => void;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;

  constructor(options: TknClientOptions = {}) {
    const socketUrl = options.socketUrl || "localhost:4001";
    const [socketHost, socketPortStr] = socketUrl.split(":");
    const socketPort = parseInt(socketPortStr, 10);

    this.options = {
      host: options.host || socketHost,
      port: options.port || socketPort,
      socketUrl: socketUrl,
      sessionConfig: options.sessionConfig || {},
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

      if (message === "CONFIG_REQUIRED") {
        // Server is requesting configuration
        this.sendConfiguration();
      } else if (message === "READY") {
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
   * Send session configuration to the server
   */
  private sendConfiguration(): void {
    if (!this.connected || !this.socket) {
      return;
    }

    try {
      const configMessage = `CONFIG:${JSON.stringify(
        this.options.sessionConfig
      )}`;
      const messageData = new TextEncoder().encode(configMessage);

      // Create properly framed message with 5-byte header
      const messageType = 0; // Default message type
      const messageLength = messageData.length;

      // Create header buffer (5 bytes total)
      const headerBuffer = new Uint8Array(5);
      headerBuffer[0] = messageType;
      headerBuffer[1] = (messageLength >>> 24) & 0xff;
      headerBuffer[2] = (messageLength >>> 16) & 0xff;
      headerBuffer[3] = (messageLength >>> 8) & 0xff;
      headerBuffer[4] = messageLength & 0xff;

      // Combine header and message data
      const framedMessage = new Uint8Array(
        headerBuffer.length + messageData.length
      );
      framedMessage.set(headerBuffer, 0);
      framedMessage.set(messageData, headerBuffer.length);

      this.socket.write(framedMessage);
    } catch (error) {
      this.onError(error as Error);
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
      // Use newline-delimited format for maximum efficiency
      // Instead of JSON: [{"data":"T"},{"data":"h"}] (25 bytes)
      // Use simple format: T\nh\n (4 bytes) - 84% reduction!
      const delimitedData = items.map((item) => item.data).join("\n") + "\n";
      const messageData = new TextEncoder().encode(delimitedData);

      // Create properly framed message with 5-byte header
      // Header format: [messageType (1 byte)][messageLength (4 bytes, big-endian)]
      const messageType = 0; // Default message type for batch data
      const messageLength = messageData.length;

      // Create header buffer (5 bytes total)
      const headerBuffer = new Uint8Array(5);
      headerBuffer[0] = messageType;
      headerBuffer[1] = (messageLength >>> 24) & 0xff; // Most significant byte
      headerBuffer[2] = (messageLength >>> 16) & 0xff;
      headerBuffer[3] = (messageLength >>> 8) & 0xff;
      headerBuffer[4] = messageLength & 0xff; // Least significant byte

      // Combine header and message data
      const framedMessage = new Uint8Array(
        headerBuffer.length + messageData.length
      );
      framedMessage.set(headerBuffer, 0);
      framedMessage.set(messageData, headerBuffer.length);

      this.socket.write(framedMessage);
    } catch (error) {
      this.onError(error as Error);
      throw error;
    }
  }

  /**
   * Send a single item (convenience method)
   */
  async sendItem(data: string): Promise<void> {
    return this.sendBatch([{ data }]);
  }

  /**
   * Send multiple items as separate batch items
   */
  async sendItems(items: string[]): Promise<void> {
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
