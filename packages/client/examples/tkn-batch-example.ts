/**
 * TKN Protocol - Batch Reader Example
 *
 * This example demonstrates using the BatchedFileReader and BatchEmitter
 * to read a file in batches and send each batch as a TKN batch message,
 * with each character of the batch being a separate item in the TKN batch.
 *
 * Usage:
 *   bun run examples/tkn-batch-example.ts [options]
 *
 * Options:
 *   --batch-size <size>    Set batch size in bytes (default: 256)
 *   --interval <ms>        Set interval between batches in ms (default: 1000)
 *   --test-mode            Run in test mode without connecting to server
 *   --help                 Show this help
 */

import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { BatchedFileReader } from "./batched-file-reader";
import { BatchEmitter } from "./batch-emitter";
import { TknClient } from "../src/client";
import { TYPE_STRING, TYPE_BATCH, type TknBatchItem } from "../src/common";

// Add Node.js process type
declare const process: {
  exit: (code?: number) => never;
  argv: string[];
};

// Parse command line arguments
const args = process.argv.slice(2);
let batchSize = 256;
let intervalMs = 1000;
let testMode = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--batch-size" && i + 1 < args.length) {
    batchSize = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--interval" && i + 1 < args.length) {
    intervalMs = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--test-mode") {
    testMode = true;
  } else if (args[i] === "--help") {
    console.log(`
TKN Protocol - Batch Reader Example

Usage:
  bun run examples/tkn-batch-example.ts [options]

Options:
  --batch-size <size>    Set batch size in bytes (default: 256)
  --interval <ms>        Set interval between batches in ms (default: 1000)
  --test-mode            Run in test mode without connecting to server
  --help                 Show this help
`);
    process.exit(0);
  }
}

// Setup file path
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const relativePath =
  "examples/test_files/Mus_musculus.GRCm39.dna.chromosome.MT.fa";
const path = join(projectRoot, relativePath);

console.log("🔍 Reading file:", path);
console.log(
  `📋 Configuration: batch size: ${batchSize} bytes, interval: ${intervalMs}ms, test mode: ${
    testMode ? "yes" : "no"
  }`
);

// Create a type for our client interface
interface ClientInterface {
  connect: () => void;
  sendBatch: (items: TknBatchItem[], pad: boolean) => boolean | void;
  disconnect: () => void;
}

// Create mock TKN client for test mode
const mockClient: ClientInterface = {
  connect: () => {
    console.log("✅ Mock client connected");
  },
  sendBatch: (items: TknBatchItem[], pad: boolean) => {
    console.log(`📤 Mock sending batch of ${items.length} items`);
    return true;
  },
  disconnect: () => {
    console.log("Mock client disconnected");
  },
};

// Create TKN client if not in test mode
let client: ClientInterface;

if (testMode) {
  client = mockClient;
  startBatchProcessing();
} else {
  client = new TknClient({
    host: "localhost",
    port: 4001,

    onConnect: () => {
      console.log("✅ Connected to TKN server!");
      console.log("⏳ Starting to process file in batches...");

      // Start the batch processing once connected
      startBatchProcessing();
    },

    onData: (data) => {
      const response = new TextDecoder().decode(data);
      console.log(`  ← Server: ${response}`);
    },

    onError: (error) => {
      console.error("❌ Error:", error);
      process.exit(1);
    },

    onClose: () => {
      console.log("🔒 Connection closed");
    },
  });

  // Connect to the server
  console.log("🔌 Connecting to TKN server...");
  client.connect();
}

function startBatchProcessing() {
  // Track batches sent for logging
  let batchesSent = 0;
  let totalItemsSent = 0;
  const startTime = Date.now();

  // Create batch emitter with interval-based processing
  const batchEmitter = new BatchEmitter({
    intervalMs: intervalMs,

    onBatch: (batchData, index) => {
      // For each batch of data from the file:
      // 1. Convert each character to a separate TknBatchItem (string type)
      // 2. Send the entire array as a TKN batch message

      const items: TknBatchItem[] = [];

      // Convert each character in the batch to a separate item
      for (let i = 0; i < batchData.length; i++) {
        const char = batchData[i];
        items.push({
          type: TYPE_STRING,
          data: char,
        });
      }

      // Send batch to server
      client.sendBatch(items, true);

      // Update statistics
      batchesSent++;
      totalItemsSent += items.length;

      // Calculate progress indicators
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const itemsPerSecond = Math.round(
        (totalItemsSent / (Date.now() - startTime)) * 1000
      );

      // Log progress
      console.log(
        `📦 Batch ${index} sent: ${items.length} items (total: ${totalItemsSent} items, ${batchesSent} batches, ${elapsed}s, ${itemsPerSecond} items/sec)`
      );
    },

    onComplete: () => {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      const itemsPerSecond = Math.round(
        (totalItemsSent / (Date.now() - startTime)) * 1000
      );

      console.log("\n✨ All batches processed and sent!");
      console.log(
        `📊 Statistics: ${batchesSent} batches, ${totalItemsSent} total characters, ${totalTime}s elapsed, ${itemsPerSecond} items/sec`
      );

      // Disconnect from server after a delay
      setTimeout(() => {
        console.log("👋 Disconnecting...");
        client.disconnect();
        setTimeout(() => process.exit(0), 500);
      }, 1000);
    },
  });

  // Create file reader
  const fileReader = new BatchedFileReader(path, {
    batchSize: batchSize,

    onBatch: (batch) => {
      // Pass each batch from the file to the emitter
      batchEmitter.addBatch(batch);
    },

    onComplete: () => {
      console.log("📄 File reading complete, waiting for emitter to finish...");
      batchEmitter.complete();
    },

    onError: (err) => {
      console.error("❌ Error reading file:", err);
      if (!testMode) client.disconnect();
      process.exit(1);
    },
  });

  // Start the emitter and file reader
  console.log("🚀 Starting batch emitter...");
  batchEmitter.start();

  console.log("📖 Starting file reader...");
  fileReader.start().catch((err) => {
    console.error("❌ Error starting file reader:", err);
    if (!testMode) client.disconnect();
    process.exit(1);
  });
}
