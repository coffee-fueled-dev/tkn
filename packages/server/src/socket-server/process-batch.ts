import type { Socket } from "bun";
import { parseToBatch, type BatchItem } from "./parse-to-batch";
import type { SocketData } from ".";
import { type OutputToken, type TknMinerCallback } from "./miner";
import type { HashedValue } from "./cyrb53";

export const PROTOCOL_HEADER_SIZE = 5;

export function processBatch(socket: Socket<SocketData>, rawData: any): void {
  try {
    const items = parseToBatch(rawData);
    for (const item of items) {
      socket.data.processingQueue.push(item);
      socket.data.monitor.incrementItemsIngested();
    }
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
    const item = socket.data.processingQueue.shift();
    if (item) {
      await processItem(socket, item);
    }
  }

  socket.data.isProcessing = false;
}

async function processItem(
  socket: Socket<SocketData>,
  item: BatchItem
): Promise<void> {
  const { monitor, symbolTable, tknMiner, memgraphManager } = socket.data;

  // Hash the current item and ensure it's stored in the symbol table
  const hashedValue = symbolTable.getHash(item.data);
  monitor.countBytes(item);

  try {
    const token = await new Promise<OutputToken | null>((resolve, reject) => {
      const callback: TknMinerCallback = async (err, tokenResult) => {
        if (err) return reject(err);
        resolve(tokenResult);
      };
      tknMiner.transform([hashedValue], callback);
    });

    if (token !== null) {
      // All hashes should be valid since we wait for processing to complete before cleanup
      const originalData = token.hashes.map((hash: HashedValue) => {
        return symbolTable.getData(hash);
      });

      const outputToken = {
        ...token,
        originalData,
      };

      await memgraphManager.process(outputToken);
      monitor.incrementTokensEmitted();
    }
  } catch (err) {
    console.error("Error during item processing:", err);
  }
}
