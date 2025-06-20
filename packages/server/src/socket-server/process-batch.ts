import type { Socket } from "bun";
import { parseToBatch, type BatchItem } from "./parse-to-batch";
import type { SocketData } from ".";

export const PROTOCOL_HEADER_SIZE = 5;

/**
 * Process incoming data as a batch of items
 * Expects data to be Array<{ data: string | Uint8Array }>
 */
export function processBatch(socket: Socket<SocketData>, rawData: any): void {
  try {
    for (const item of parseToBatch(rawData)) {
      processItem(socket, item);
    }
  } catch (err) {
    console.error("Error processing batch:", err);
  }
}

async function processItem(
  socket: Socket<SocketData>,
  item: BatchItem
): Promise<void> {
  try {
    const { monitor } = socket.data;

    // Hash the item (this is fast, no need to monitor)
    const hashedValue = socket.data.symbolTable.getHash(item.data);

    // Start monitoring transform operation
    const transformStart = monitor.startTransform();

    socket.data.tknMiner.transform([hashedValue], async (err, token) => {
      // End transform monitoring
      const hadOutput = token !== null;
      monitor.endTransform(transformStart, hadOutput);

      if (err) {
        console.error("Error in token miner:", err);
      } else if (token === null) {
        // Token was merged, no further processing needed
        console.log("Chunk is being merged.");
      } else {
        // Token was emitted, process with memgraph
        const memgraphStart = monitor.startMemgraph();

        await socket.data.memgraphManager.process(token, async (error) => {
          // End memgraph monitoring
          monitor.endMemgraph(memgraphStart);

          if (error) {
            console.error("Error in memgraph manager:", error);
          }
        });
      }
    });
  } catch (error) {
    console.error("Error processing item:", error);
  }
}
