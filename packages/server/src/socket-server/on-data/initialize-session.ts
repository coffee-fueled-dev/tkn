import type { Socket } from "bun";
import type { SocketData } from "..";
import pino from "pino";
import { keyGenerators, type KeyGeneratorName } from "../key-generators";
import { LZST } from "../lzst";
import { variables } from "../../environment";
import { TokenCache } from "../token-cache";

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

  // Validate and set key generator
  if (config.keyGenerator && config.keyGenerator in keyGenerators) {
    socket.data.keyGeneratorName = config.keyGenerator as KeyGeneratorName;
  }

  // Initialize session with selected configuration
  await initializeSession(socket);
};

export const initializeSession = async (socket: Socket<SocketData>) => {
  const { sessionId, keyGeneratorName } = socket.data;

  try {
    // Create LZST with selected key generator
    const selectedKeyGenerator = keyGenerators[keyGeneratorName];
    const tokenCache = new TokenCache(
      BANK_SIZE,
      keyGenerators[keyGeneratorName]
    );
    socket.data.tokenCache = tokenCache;
    socket.data.lzst = new LZST(tokenCache, MAX_WINDOW_SIZE);

    // Ensure Redis connection is established before processing
    await socket.data.redisPublisher.getSubscriberCount();

    socket.data.configured = true;

    logger.info(
      {
        sessionId,
        keyGenerator: keyGeneratorName,
      },
      "Session configured and ready"
    );

    socket.write("READY");
  } catch (error) {
    logger.warn(
      {
        sessionId,
        error,
        keyGenerator: keyGeneratorName,
      },
      "Failed to initialize session with configuration"
    );

    socket.write("READY");
  }
};
