import { relative } from "path";
import {
  TknNodeClient,
  TYPE_STRING,
  TYPE_BINARY,
  TYPE_JSON,
  type TknMessageType,
  type TknData,
} from "tkn-client";
import type { CliOptions, ProcessingStats } from "./types.js";
import {
  detectFileFormat,
  streamFileInChunks,
  streamTextFileByCharacter,
  streamJsonFile,
} from "./file-utils.js";
import { sendBatch } from "./client.js";

export async function processFile(
  filePath: string,
  client: TknNodeClient | null,
  options: CliOptions
): Promise<ProcessingStats> {
  const format = detectFileFormat(filePath, options);
  const fileSize = await Bun.file(filePath).size;

  if (options.verbose) {
    console.log(
      `📁 Processing: ${relative(
        process.cwd(),
        filePath
      )} (${fileSize} bytes, ${format} format)`
    );
  }

  let chunkCount = 0;
  let byteCount = 0;
  let batch: Array<{ type: TknMessageType; data: TknData }> = [];

  if (format === "text") {
    // Stream character by character for text files
    for await (const char of streamTextFileByCharacter(filePath)) {
      chunkCount++;
      byteCount += Buffer.byteLength(char, "utf8");

      batch.push({
        type: TYPE_STRING,
        data: char,
      });

      // Send batch when it reaches the configured size
      if (batch.length >= options.batchSize) {
        await sendBatch(
          batch,
          client,
          options,
          chunkCount - batch.length + 1,
          chunkCount
        );
        batch = [];
      }
    }
  } else if (format === "json") {
    // Stream JSON objects individually
    for await (const jsonObj of streamJsonFile(filePath)) {
      chunkCount++;
      const jsonStr = JSON.stringify(jsonObj);
      byteCount += Buffer.byteLength(jsonStr, "utf8");

      batch.push({
        type: TYPE_JSON,
        data: jsonObj,
      });

      // Send batch when it reaches the configured size
      if (batch.length >= options.batchSize) {
        await sendBatch(
          batch,
          client,
          options,
          chunkCount - batch.length + 1,
          chunkCount
        );
        batch = [];
      }
    }
  } else {
    // Binary files - stream in chunks as before
    for await (const chunk of streamFileInChunks(filePath, options.chunkSize)) {
      chunkCount++;
      byteCount += chunk.length;

      batch.push({
        type: TYPE_BINARY,
        data: chunk,
      });

      // Send batch when it reaches the configured size
      if (batch.length >= options.batchSize) {
        await sendBatch(
          batch,
          client,
          options,
          chunkCount - batch.length + 1,
          chunkCount
        );
        batch = [];
      }
    }
  }

  // Send remaining chunks in final batch
  if (batch.length > 0) {
    await sendBatch(
      batch,
      client,
      options,
      chunkCount - batch.length + 1,
      chunkCount
    );
  }

  return { chunks: chunkCount, bytes: byteCount };
}

export function printSummary(
  files: string[],
  totalChunks: number,
  totalBytes: number,
  elapsed: number,
  isDryRun: boolean = false
): void {
  console.log(`\n🎉 Complete!`);
  console.log(`  Files processed: ${files.length}`);
  console.log(`  Total chunks: ${totalChunks}`);
  console.log(`  Total bytes: ${totalBytes.toLocaleString()}`);
  console.log(`  Time elapsed: ${elapsed.toFixed(2)}s`);

  // Simple throughput - only show if meaningful
  if (elapsed > 0.01 && totalBytes > 1000) {
    const throughput = Math.round(totalBytes / elapsed);
    const label = isDryRun ? "Processing rate" : "Throughput";
    console.log(`  ${label}: ${throughput.toLocaleString()} bytes/sec`);
  }
}
