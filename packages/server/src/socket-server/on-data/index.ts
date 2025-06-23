import type { Socket } from "bun";
import { parseMessage } from "./parse-message";
import type { SocketData } from "..";
import { handleConfigMessage, type SessionConfig } from "./initialize-session";
import pino from "pino";
import { variables } from "../../environment";

const logger = pino({ name: "socket-server-on-data" });

const { BATCH_SIZE, ITEM_SIZE_THRESHOLD } = variables;

export function onData(socket: Socket<SocketData>, data: Uint8Array) {
  socket.data.messageBuffer.push(data);

  let message;
  while ((message = socket.data.messageBuffer.extractMessage()) !== null) {
    const parsed = parseMessage(message.data);

    if (parsed.type === "config") {
      handleConfigMessage(socket, parsed.content as SessionConfig);
      continue;
    }

    // Only process data messages if session is configured
    if (!socket.data.configured) {
      logger.warn(
        { sessionId: socket.data.sessionId },
        "Received data before configuration, ignoring"
      );
      continue;
    }

    const content = parsed.content as string[];
    socket.data.queue.push(...content);

    const shouldDrain =
      !socket.data.draining &&
      (socket.data.queue.length >= BATCH_SIZE ||
        socket.data.queue.some((item) => item.length > ITEM_SIZE_THRESHOLD));

    if (shouldDrain) {
      socket.data.drain(socket.data.queue);
    }
  }
}
