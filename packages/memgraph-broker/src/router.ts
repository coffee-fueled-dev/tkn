import type { Token } from "./types";
import { Broker } from "./broker";
import pino from "pino";
import { Decoder } from "./decoder";

const logger = pino({ name: "broker-manager" });
const decoder = new Decoder(new TextDecoder("utf-8", { fatal: false }));

export class Router {
  private readonly brokers: Map<string, Broker>;
  private readonly messageBuffers: Map<string, Token[]>;
  private readonly brokerStates: Map<string, "initializing" | "ready">;

  constructor() {
    this.brokers = new Map<string, Broker>();
    this.messageBuffers = new Map<string, Token[]>();
    this.brokerStates = new Map<string, "initializing" | "ready">();
  }

  async getBroker(sessionId: string): Promise<Broker> {
    if (!this.brokers.has(sessionId)) {
      this.brokerStates.set(sessionId, "initializing");

      const broker = new Broker(sessionId);
      await broker.initializeSession();
      this.brokers.set(sessionId, broker);

      const bufferedMessages = this.messageBuffers.get(sessionId) || [];
      for (const token of bufferedMessages) {
        broker.pushToBatch(token);
      }
      this.messageBuffers.delete(sessionId);

      this.brokerStates.set(sessionId, "ready");

      logger.info(`Created broker for session ${sessionId}`);
    }
    return this.brokers.get(sessionId)!;
  }

  pushToBroker(token: Token) {
    const sessionId = token.sessionId;
    const brokerState = this.brokerStates.get(sessionId);
    const tokenString = decoder.decodeToken(token.buffer);

    logger.debug(
      `Pushing token ${tokenString} to broker for session ${sessionId}, state: ${
        brokerState || "none"
      }`
    );

    if (brokerState === "ready") {
      const broker = this.brokers.get(sessionId)!;
      broker.pushToBatch(token);
    } else if (brokerState === "initializing") {
      const buffer = this.messageBuffers.get(sessionId) || [];
      buffer.push(token);
      this.messageBuffers.set(sessionId, buffer);
      logger.debug(
        `Buffered token ${tokenString} for initializing session ${sessionId}, buffer size: ${buffer.length}`
      );
    } else {
      const buffer = this.messageBuffers.get(sessionId) || [];
      buffer.push(token);
      this.messageBuffers.set(sessionId, buffer);
      logger.debug(
        `Buffered token ${tokenString} for new session ${sessionId}, buffer size: ${buffer.length}`
      );

      this.getBroker(sessionId).catch((error) => {
        logger.error(
          `Failed to create broker for session ${sessionId}:`,
          error
        );
      });
    }
  }

  async removeBroker(sessionId: string) {
    const broker = this.brokers.get(sessionId);
    if (broker) {
      await broker.closeSession();
      broker.destroy();
    }
    this.brokers.delete(sessionId);
    this.brokerStates.delete(sessionId);
    this.messageBuffers.delete(sessionId);
    logger.info(`Removed broker for session ${sessionId}`);
  }
}
