import type { Socket } from "bun";
import { parseToBatch, type BatchItem } from "./parse-to-batch";
import type { SocketData } from ".";
import { type OutputToken, type TknMinerCallback } from "./miner";
import type { HashedValue } from "./cyrb53";

export const PROTOCOL_HEADER_SIZE = 5;

// Batch size for miner processing
const MINER_BATCH_SIZE = 50;

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
    // Process items in batches for the miner
    const batchItems: BatchItem[] = [];
    const batchSize = Math.min(
      MINER_BATCH_SIZE,
      socket.data.processingQueue.length
    );

    for (let i = 0; i < batchSize; i++) {
      const item = socket.data.processingQueue.shift();
      if (item) {
        batchItems.push(item);
      }
    }

    if (batchItems.length > 0) {
      await processMinerBatch(socket, batchItems);
    }
  }

  socket.data.isProcessing = false;
}

async function processMinerBatch(
  socket: Socket<SocketData>,
  items: BatchItem[]
): Promise<void> {
  const { monitor, symbolTable, tknMiner, memgraphManager } = socket.data;

  // Hash all items and store in symbol table
  const hashedValues: HashedValue[] = [];
  for (const item of items) {
    const hashedValue = symbolTable.getHash(item.data);
    hashedValues.push(hashedValue);
    monitor.countBytes(item);
  }

  try {
    // Process the entire batch through the miner at once
    const tokens: OutputToken[] = [];

    monitor.startTransformTiming();
    await new Promise<void>((resolve, reject) => {
      let tokenCount = 0;
      let completed = false;

      const callback: TknMinerCallback = async (err, tokenResult) => {
        if (err) return reject(err);

        // Track transform - miner actually processed an item
        monitor.incrementTransforms();

        if (tokenResult !== null) {
          tokens.push(tokenResult);
          // Track token emission when miner actually produces a token
          monitor.incrementTokensEmitted();
        }

        tokenCount++;

        // The miner calls the callback once per input item
        if (tokenCount >= items.length && !completed) {
          completed = true;
          resolve();
        }
      };

      tknMiner.transform(hashedValues, callback);
    });
    monitor.endTransformTiming();

    // Process any tokens that were emitted
    for (const token of tokens) {
      // Get original data for the token hashes
      const originalData = token.hashes.map((hash: HashedValue) => {
        return symbolTable.getData(hash);
      });

      const outputToken = {
        ...token,
        originalData,
      };

      // Process database operation without blocking
      memgraphManager
        .process(outputToken)
        .catch((err) =>
          console.error("Error persisting token to Memgraph:", err)
        );
    }
  } catch (err) {
    console.error("Error during batch processing:", err);
  }
}
