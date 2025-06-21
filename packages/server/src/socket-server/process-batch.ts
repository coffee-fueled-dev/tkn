import type { Socket } from "bun";
import { type BatchItem } from "./parse-message";
import type { SocketData } from ".";
import type { HashedValue } from "./cyrb53";

export const PROTOCOL_HEADER_SIZE = 5;

export function processBatch(
  socket: Socket<SocketData>,
  items: BatchItem[]
): void {
  try {
    let totalBytes = 0;
    for (const item of items) {
      socket.data.processingQueue.push(item);
      totalBytes += item.data.length;
    }

    socket.data.sessionBytesReceived += totalBytes;

    if (!socket.data.isProcessing) {
      processQueue(socket);
    }
  } catch (err) {
    console.error("Error processing batch:", err);
  }
}

async function processQueue(socket: Socket<SocketData>): Promise<void> {
  socket.data.isProcessing = true;

  while (socket.data.processingQueue.length > 0) {
    await new Promise<void>((resolve, reject) => {
      const item = socket.data.processingQueue.shift();
      let hashedValue: HashedValue | null = null;

      if (!item) {
        return reject(new Error("No item to process"));
      }

      hashedValue = socket.data.symbolTable.getHash(item.data);

      if (!hashedValue) {
        return reject(new Error("No hashed value"));
      }

      socket.data.tknMiner.transform([hashedValue], async (err, token) => {
        socket.data.operationCount++;

        if (err) return reject(err);

        if (token !== null) {
          socket.data.tokenCount++;

          // Maybe we should deep clone here to prevent resource re-use?
          const originalData = token.hashes.map((hash: HashedValue) =>
            socket.data.symbolTable.getData(hash)
          );

          const outputToken = {
            ...token,
            originalData,
          };

          // Fire-and-forget to avoid blocking the processing pipeline
          // memgraphManager
          //   .process(outputToken)
          //   .catch((err) =>
          //     console.error("Error persisting token to Memgraph:", err)
          //   );
        }

        resolve();
      });
    });
  }

  socket.data.isProcessing = false;

  // Mark when processing actually completes
  if (socket.data.processingQueue.length === 0) {
    socket.data.processingCompletedTime = performance.now();
    const sessionTime =
      socket.data.processingCompletedTime - socket.data.sessionStartTime;
    console.log(
      `✅ Processing completed at session+${sessionTime.toFixed(2)}ms`
    );
  }
}
