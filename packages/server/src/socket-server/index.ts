import { variables } from "../environment";
import type { MessageBuffer } from "./message-buffer";
import { LZST } from "./lzst";
import { type KeyGeneratorName } from "./key-generators";
import { RedisPublisher } from "./redis-publisher";
import pino from "pino";
import { TokenCache } from "./token-cache";
import { onOpen } from "./on-open";
import { onClose } from "./on-close";
import { onData } from "./on-data";

const logger = pino({ name: "socket-server" });

export type SocketData = {
  sessionId: string;
  lzst: LZST;
  tokenCache: TokenCache;
  redisPublisher: RedisPublisher;
  messageBuffer: MessageBuffer;
  queue: string[];
  draining: boolean;
  drain: (queue: string[]) => void;
  configured: boolean; // Track if session is configured
  keyGeneratorName: KeyGeneratorName;
  performance: {
    startTime: number;
    totalBytesProcessed: number;
    totalProcessingTime: number;
    drainCallCount: number;
    batchingTime: number;
    tokenizationTime: number;
  };
};

export const startSocketServer = () =>
  Bun.listen<SocketData>({
    hostname: "0.0.0.0",
    port: variables.TKN_PORT + 1,
    socket: {
      data: onData,
      open: onOpen,
      close: onClose,
      error(err) {
        logger.error({ error: err }, "Socket error");
      },
    },
  });
