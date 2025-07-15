import type { Socket } from "bun";
import type { SocketData } from "..";
import pino from "pino";
import { keyGenerators, type KeyGeneratorName, LZST } from "@tkn/core";
import { variables } from "../../environment";

const logger = pino({ name: "socket-server-on-data" });

const { MAX_WINDOW_SIZE, BANK_SIZE } = variables;

export interface SessionConfig {
  keyGenerator?: string;
  preloader?: string;
}

export const handleConfigMessage = async (
  socket: Socket<SocketData>,
  config: SessionConfig
) => {
  const { sessionId } = socket.data;

  logger.info({ sessionId, config }, "Received session configuration");

  await initializeSession(socket);
};

export const initializeSession = async (socket: Socket<SocketData>) => {
  const { sessionId } = socket.data;

  try {
    socket.data.lzst = new LZST({
      memorySize: BANK_SIZE,
      keyGenerator: keyGenerators.fastHash,
    });

    // Ensure Redis connection is established before processing
    await socket.data.redisPublisher.getSubscriberCount();

    socket.data.configured = true;

    logger.info(
      {
        sessionId,
      },
      "Session configured and ready"
    );

    socket.write("READY");
  } catch (error) {
    logger.warn(
      {
        sessionId,
        error,
      },
      "Failed to initialize session with configuration"
    );

    socket.write("READY");
  }
};
