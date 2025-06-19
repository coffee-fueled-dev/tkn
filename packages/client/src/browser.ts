/**
 * TKN Browser Client - WebSocket-based client for browser environments
 */

import {
  TYPE_JSON,
  TYPE_STRING,
  TYPE_BINARY,
  TYPE_BATCH,
  encodeMessage,
  type TknBatchItem,
  type TknMessageType,
  type TknData,
} from "./common";

export interface TknBrowserOptions {
  url?: string;
  onConnect?: (client: TknBrowserClient) => void;
  onData?: (data: ArrayBuffer) => void;
  onError?: (error: Event) => void;
  onClose?: (event: CloseEvent) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export class TknBrowserClient {
  private socket: WebSocket | null = null;
  private connected = false;
  private reconnectTimer: number | null = null;
  private readonly options: Required<TknBrowserOptions>;

  constructor(options: TknBrowserOptions = {}) {
    this.options = this.applyDefaults(options);
  }

  private applyDefaults(
    options: TknBrowserOptions
  ): Required<TknBrowserOptions> {
    return {
      url: options.url ?? "ws://localhost:4001",
      onConnect: options.onConnect ?? (() => {}),
      onData: options.onData ?? (() => {}),
      onError: options.onError ?? (() => {}),
      onClose: options.onClose ?? (() => {}),
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 5000,
    };
  }

  public async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.createWebSocketConnection();
        this.configureWebSocketForBinaryData();
        this.attachWebSocketEventHandlers(resolve);
      } catch (error) {
        this.handleConnectionError(error as Event);
        this.scheduleReconnectionIfEnabled();
        resolve(false);
      }
    });
  }

  private createWebSocketConnection(): void {
    this.socket = new WebSocket(this.options.url);
  }

  private configureWebSocketForBinaryData(): void {
    if (this.socket) {
      this.socket.binaryType = "arraybuffer";
    }
  }

  private attachWebSocketEventHandlers(
    resolve: (connected: boolean) => void
  ): void {
    if (!this.socket) return;

    this.socket.onopen = () => this.handleConnectionEstablished(resolve);
    this.socket.onmessage = (event) => this.handleIncomingMessage(event);
    this.socket.onerror = (event) => this.handleConnectionError(event, resolve);
    this.socket.onclose = (event) =>
      this.handleConnectionClosed(event, resolve);
  }

  private handleConnectionEstablished(
    resolve: (connected: boolean) => void
  ): void {
    this.connected = true;
    this.options.onConnect(this);
    resolve(true);
  }

  private handleIncomingMessage(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer) {
      this.options.onData(event.data);
    }
  }

  private handleConnectionError(
    error: Event,
    resolve?: (connected: boolean) => void
  ): void {
    this.options.onError(error);
    if (resolve) {
      resolve(false);
    }
  }

  private handleConnectionClosed(
    event: CloseEvent,
    resolve: (connected: boolean) => void
  ): void {
    this.connected = false;
    this.options.onClose(event);
    this.scheduleReconnectionIfEnabled();
    resolve(false);
  }

  private scheduleReconnectionIfEnabled(): void {
    if (this.options.autoReconnect && !this.reconnectTimer) {
      this.reconnectTimer = window.setTimeout(async () => {
        this.reconnectTimer = null;
        if (!this.connected) {
          await this.connect();
        }
      }, this.options.reconnectInterval);
    }
  }

  public sendJson(data: object): boolean {
    return this.sendBinaryMessage(TYPE_JSON, data);
  }

  public sendString(data: string): boolean {
    return this.sendBinaryMessage(TYPE_STRING, data);
  }

  public sendBinary(data: Uint8Array): boolean {
    return this.sendBinaryMessage(TYPE_BINARY, data);
  }

  public sendBatch(items: { type: TknMessageType; data: TknData }[]): boolean {
    this.validateBatchItems(items);
    return this.sendBinaryMessage(TYPE_BATCH, items);
  }

  private validateBatchItems(
    items: { type: TknMessageType; data: TknData }[]
  ): void {
    for (const item of items) {
      if (item.type === TYPE_BATCH) {
        throw new Error("Nested batches are not supported");
      }
    }
  }

  private sendBinaryMessage(
    type: TknMessageType,
    data: TknData | TknBatchItem[]
  ): boolean {
    if (!this.canSendData()) {
      return false;
    }

    try {
      const encodedMessage = encodeMessage(type, data);
      this.transmitBinaryData(encodedMessage);
      return true;
    } catch (error) {
      console.error("Failed to send message:", error);
      return false;
    }
  }

  private canSendData(): boolean {
    return (
      this.connected &&
      this.socket !== null &&
      this.socket.readyState === WebSocket.OPEN
    );
  }

  private transmitBinaryData(data: Uint8Array): void {
    if (this.socket) {
      this.socket.send(data);
    }
  }

  public disconnect(): void {
    this.cancelScheduledReconnection();
    this.closeWebSocketConnection();
    this.markAsDisconnected();
  }

  private cancelScheduledReconnection(): void {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeWebSocketConnection(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch (error) {
        // Ignore errors during disconnect
      }
      this.socket = null;
    }
  }

  private markAsDisconnected(): void {
    this.connected = false;
  }

  public isConnected(): boolean {
    return this.connected;
  }
}
