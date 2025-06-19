/**
 * TKN Client - Unified client implementation for TKN protocol
 * Works in both browser and Node.js/Bun environments
 */

import {
  TYPE_JSON,
  TYPE_STRING,
  TYPE_BINARY,
  TYPE_BATCH,
  encodeMessage,
  type TknBatchItem,
} from "./common";

import type { TknMessageType, TknData, TknClientOptionsBase } from "./common";

// Platform detection
export const isBrowser =
  typeof window !== "undefined" && typeof WebSocket !== "undefined";
export const isNode =
  !isBrowser &&
  typeof process !== "undefined" &&
  typeof require !== "undefined";
export const isBun = !isBrowser && typeof Bun !== "undefined";

// Browser-specific options
export interface TknBrowserOptions extends TknClientOptionsBase {
  url?: string;
}

// Node/Bun-specific options
export interface TknNodeOptions extends TknClientOptionsBase {
  host?: string;
  port?: number;
}

// Combined options type
export type TknClientOptions = TknBrowserOptions & TknNodeOptions;

/**
 * Abstract base class for TKN clients
 * Contains common functionality for all platforms
 */
export abstract class TknClientBase {
  protected connected: boolean = false;
  protected reconnectTimer: any = null;
  protected options: TknClientOptions;

  constructor(options: TknClientOptions = {}) {
    this.options = {
      // Common defaults
      autoReconnect:
        options.autoReconnect !== undefined ? options.autoReconnect : true,
      reconnectInterval: options.reconnectInterval || 5000,
      onConnect: options.onConnect,
      onData: options.onData,
      onError: options.onError,
      onClose: options.onClose,

      // Browser defaults
      url: options.url || "ws://localhost:8080",

      // Node/Bun defaults
      host: options.host || "localhost",
      port: options.port || 8080,
    };
  }

  /**
   * Connect to the TKN server
   * Abstract method to be implemented by platform-specific subclasses
   */
  public abstract connect(): Promise<boolean>;

  /**
   * Disconnect from the server
   * Abstract method to be implemented by platform-specific subclasses
   */
  public abstract disconnect(): void;

  /**
   * Send raw data with the specified type
   * Abstract method to be implemented by platform-specific subclasses
   */
  protected abstract sendRaw(
    type: TknMessageType,
    data: TknData | TknBatchItem[]
  ): boolean;

  /**
   * Try to reconnect to the server if autoReconnect is enabled
   * Common implementation with platform-specific setTimeout
   */
  protected tryReconnect() {
    if (this.options.autoReconnect && !this.reconnectTimer) {
      // Use platform-specific setTimeout
      this.reconnectTimer = this.setTimeout(async () => {
        this.reconnectTimer = null;
        if (!this.connected) {
          await this.connect();
        }
      }, this.options.reconnectInterval as number);
    }
  }

  /**
   * Platform-specific setTimeout implementation
   */
  protected abstract setTimeout(callback: () => void, ms: number): any;

  /**
   * Platform-specific clearTimeout implementation
   */
  protected abstract clearTimeout(id: any): void;

  /**
   * Send JSON data to the server
   */
  public sendJson(data: object): boolean {
    return this.sendRaw(TYPE_JSON, data);
  }

  /**
   * Send string data to the server
   */
  public sendString(data: string): boolean {
    return this.sendRaw(TYPE_STRING, data);
  }

  /**
   * Send binary data to the server
   */
  public sendBinary(data: Uint8Array): boolean {
    return this.sendRaw(TYPE_BINARY, data);
  }

  /**
   * Send a batch of mixed data types to the server
   *
   * @param items Array of items with their types
   */
  public sendBatch(items: { type: TknMessageType; data: TknData }[]): boolean {
    // Don't allow nested batches
    for (const item of items) {
      if (item.type === TYPE_BATCH) {
        throw new Error("Nested batches are not supported");
      }
    }

    return this.sendRaw(TYPE_BATCH, items);
  }

  /**
   * Check if the client is connected
   */
  public isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Browser implementation using WebSocket
 */
export class TknBrowserClient extends TknClientBase {
  private socket: WebSocket | null = null;

  constructor(options: TknBrowserOptions = {}) {
    super(options);
  }

  /**
   * Connect to the TKN server via WebSocket
   */
  public connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.socket = new WebSocket(this.options.url as string);

        // Set binary type to arraybuffer
        this.socket.binaryType = "arraybuffer";

        // Set up event handlers
        this.socket.addEventListener("open", () => {
          this.connected = true;
          if (this.options.onConnect) {
            this.options.onConnect(this);
          }
          resolve(true);
        });

        this.socket.addEventListener("message", (event) => {
          if (this.options.onData && event.data instanceof ArrayBuffer) {
            this.options.onData(event.data);
          }
        });

        this.socket.addEventListener("error", (event) => {
          if (this.options.onError) {
            this.options.onError(event);
          }
          resolve(false);
        });

        this.socket.addEventListener("close", (event) => {
          this.connected = false;
          if (this.options.onClose) {
            this.options.onClose(event);
          }
          this.tryReconnect();
          resolve(false);
        });
      } catch (error) {
        console.error("WebSocket connection error:", error);
        this.tryReconnect();
        resolve(false);
      }
    });
  }

  /**
   * Send raw data with the specified type
   */
  protected sendRaw(
    type: TknMessageType,
    data: TknData | TknBatchItem[]
  ): boolean {
    if (
      !this.connected ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    try {
      const encoded = encodeMessage(type, data);
      this.socket.send(encoded);
      return true;
    } catch (error) {
      console.error("Error sending data:", error);
      return false;
    }
  }

  /**
   * Close the connection to the server
   */
  public disconnect(): void {
    if (this.reconnectTimer) {
      this.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      try {
        this.socket.close();
      } catch (error) {
        // Ignore errors on disconnect
      }
      this.socket = null;
    }

    this.connected = false;
  }

  /**
   * Browser-specific setTimeout implementation
   */
  protected setTimeout(callback: () => void, ms: number): any {
    return window.setTimeout(callback, ms);
  }

  /**
   * Browser-specific clearTimeout implementation
   */
  protected clearTimeout(id: any): void {
    window.clearTimeout(id);
  }
}

/**
 * Node.js/Bun implementation using Bun.Socket or Node.js net
 */
export class TknNodeClient extends TknClientBase {
  private socket: any = null; // Will hold the Bun.Socket instance

  constructor(options: TknNodeOptions = {}) {
    super(options);
  }

  /**
   * Connect to the TKN server using Bun.connect
   */
  public async connect(): Promise<boolean> {
    if (!isBun) {
      console.error(
        "The TknNodeClient currently only supports Bun environment"
      );
      return false;
    }

    try {
      this.socket = await Bun.connect({
        hostname: this.options.host!,
        port: this.options.port as number,
        socket: {
          data: (socket, data) => {
            // Handle server responses
            if (this.options.onData) {
              this.options.onData(data);
            }
          },
          error: (socket, error) => {
            if (this.options.onError) {
              this.options.onError(error);
            }
            this.connected = false;
            this.tryReconnect();
          },
          close: (socket) => {
            this.connected = false;
            if (this.options.onClose) {
              this.options.onClose();
            }
            this.tryReconnect();
          },
          open: (socket) => {
            this.connected = true;
            if (this.options.onConnect) {
              this.options.onConnect(this);
            }
          },
        },
      });
      return true;
    } catch (error) {
      if (this.options.onError) {
        this.options.onError(error);
      }
      this.tryReconnect();
      return false;
    }
  }

  /**
   * Send raw data with the specified type
   */
  protected sendRaw(
    type: TknMessageType,
    data: TknData | TknBatchItem[]
  ): boolean {
    if (!this.connected || !this.socket) {
      return false;
    }

    try {
      const encoded = encodeMessage(type, data);
      this.socket.write(encoded);
      return true;
    } catch (error) {
      if (this.options.onError) {
        this.options.onError(error);
      }
      return false;
    }
  }

  /**
   * Close the connection to the server
   */
  public disconnect(): void {
    if (this.reconnectTimer) {
      this.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      try {
        this.socket.end();
      } catch (error) {
        // Ignore errors on disconnect
      }
      this.socket = null;
    }

    this.connected = false;
  }

  /**
   * Node/Bun-specific setTimeout implementation
   */
  protected setTimeout(callback: () => void, ms: number): any {
    if (isBun) {
      return setTimeout(callback, ms);
    } else {
      return global.setTimeout(callback, ms);
    }
  }

  /**
   * Node/Bun-specific clearTimeout implementation
   */
  protected clearTimeout(id: any): void {
    if (isBun) {
      clearTimeout(id);
    } else {
      global.clearTimeout(id);
    }
  }
}

/**
 * Factory function to create the appropriate client based on the environment
 */
export function createTknClient(options: TknClientOptions = {}): TknClientBase {
  if (isBrowser) {
    return new TknBrowserClient(options);
  } else if (isBun) {
    return new TknNodeClient(options);
  } else {
    throw new Error("Unsupported environment. Use in browser or Bun runtime.");
  }
}

// Default client class - exports the correct implementation based on environment
export const TknClient = isBrowser ? TknBrowserClient : TknNodeClient;
