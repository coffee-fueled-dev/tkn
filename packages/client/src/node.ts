/**
 * TKN Node Client - Socket-based client for Node.js/Bun environments
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

export interface TknNodeOptions {
  host?: string;
  port?: number;
  onConnect?: (client: TknNodeClient) => void;
  onData?: (data: Uint8Array) => void;
  onError?: (error: any) => void;
  onClose?: () => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export class TknNodeClient {
  private socket: any = null;
  private connected = false;
  private reconnectTimer: any = null;
  private readonly options: Required<TknNodeOptions>;

  constructor(options: TknNodeOptions = {}) {
    this.options = this.applyDefaults(options);
  }

  private applyDefaults(options: TknNodeOptions): Required<TknNodeOptions> {
    return {
      host: options.host ?? "localhost",
      port: options.port ?? 4001,
      onConnect: options.onConnect ?? (() => {}),
      onData: options.onData ?? (() => {}),
      onError: options.onError ?? (() => {}),
      onClose: options.onClose ?? (() => {}),
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 5000,
    };
  }

  public async connect(): Promise<boolean> {
    if (!this.validateRuntimeEnvironment()) {
      return false;
    }

    try {
      await this.establishBunSocketConnection();
      return true;
    } catch (error) {
      this.handleConnectionError(error);
      this.scheduleReconnectionIfEnabled();
      return false;
    }
  }

  private validateRuntimeEnvironment(): boolean {
    if (typeof Bun === "undefined") {
      console.error("TknNodeClient currently only supports Bun runtime");
      return false;
    }
    return true;
  }

  private async establishBunSocketConnection(): Promise<void> {
    this.socket = await Bun.connect({
      hostname: this.options.host,
      port: this.options.port,
      socket: {
        data: (socket, data) => this.handleIncomingData(data),
        error: (socket, error) => this.handleSocketError(error),
        close: (socket) => this.handleSocketClose(),
        open: (socket) => this.handleSocketOpen(),
      },
    });
  }

  private handleIncomingData(data: Uint8Array): void {
    this.options.onData(data);
  }

  private handleSocketError(error: any): void {
    this.options.onError(error);
    this.connected = false;
    this.scheduleReconnectionIfEnabled();
  }

  private handleSocketClose(): void {
    this.connected = false;
    this.options.onClose();
    this.scheduleReconnectionIfEnabled();
  }

  private handleSocketOpen(): void {
    this.connected = true;
    this.options.onConnect(this);
  }

  private handleConnectionError(error: any): void {
    this.options.onError(error);
  }

  private scheduleReconnectionIfEnabled(): void {
    if (this.options.autoReconnect && !this.reconnectTimer) {
      this.reconnectTimer = setTimeout(async () => {
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
      this.handleSendError(error);
      return false;
    }
  }

  private canSendData(): boolean {
    return this.connected && this.socket !== null;
  }

  private transmitBinaryData(data: Uint8Array): void {
    this.socket.write(data);
  }

  private handleSendError(error: any): void {
    this.options.onError(error);
  }

  public disconnect(): void {
    this.cancelScheduledReconnection();
    this.closeBunSocket();
    this.markAsDisconnected();
  }

  private cancelScheduledReconnection(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeBunSocket(): void {
    if (this.socket) {
      try {
        this.socket.end();
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
