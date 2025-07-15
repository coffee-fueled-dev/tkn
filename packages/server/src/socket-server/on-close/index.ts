import type { Socket } from "bun";
import type { SocketData } from "..";
import { reportSessionPerformance } from "./report-session-performance";
import pino from "pino";

const logger = pino({ name: "socket-server-on-close" });

const decoder = new TextDecoder("utf-8", { fatal: false });

export async function onClose(socket: Socket<SocketData>) {
  const { sessionId } = socket.data;

  if (socket.data.queue.length > 0 && !socket.data.draining) {
    logger.info(
      { sessionId, queueLength: socket.data.queue.length },
      "Draining remaining items for session"
    );
    socket.data.drain(socket.data.queue);
  }

  const finalFlush = socket.data.lzst.flush();
  if (finalFlush.current) {
    const tokenString = decoder.decode(finalFlush.current);
    logger.debug(
      { sessionId, token: tokenString },
      "Flushed final token for session"
    );
  }

  while (socket.data.draining || socket.data.queue.length > 0) {
    logger.debug(
      { sessionId, queueLength: socket.data.queue.length },
      "Waiting for session to finish processing queue"
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  reportSessionPerformance(socket, sessionId);

  socket.data.messageBuffer.clear();
  socket.data.lzst.clear();

  logger.info({ sessionId }, "Session disconnected");
}
