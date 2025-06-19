#!/usr/bin/env bun

import { relative, basename } from "path";
import { TknNodeClient } from "tkn-client";
import fg from "fast-glob";

import { parseCliArgs } from "./args.js";
import { connectToServer } from "./client.js";
import { processFile, printSummary } from "./processor.js";

async function main(): Promise<void> {
  const { pattern, options } = parseCliArgs();

  console.log(`🔍 Searching for files matching: ${pattern}`);

  // Find files using fast-glob
  const files = await fg(pattern, {
    absolute: true,
    onlyFiles: true,
  });

  if (files.length === 0) {
    console.log(`❌ No files found matching pattern: ${pattern}`);
    process.exit(1);
  }

  console.log(`📋 Found ${files.length} file(s) to process`);

  if (options.verbose) {
    files.forEach((file) => {
      console.log(`  - ${relative(process.cwd(), file)}`);
    });
  }

  if (options.dryRun) {
    console.log(`\n🔍 Dry run mode - showing what would be processed:`);
    console.log(`  Host: ${options.host}:${options.port}`);
    console.log(`  Chunk size: ${options.chunkSize} bytes`);
    console.log(`  Batch size: ${options.batchSize} chunks`);
    console.log(`  Format: ${options.format}`);
  }

  let client: TknNodeClient | null = null;

  try {
    // Connect to server unless in dry-run mode
    if (!options.dryRun) {
      console.log(
        `🔌 Connecting to TKN server at ${options.host}:${options.port}...`
      );
      client = await connectToServer(options);
    }

    // Process each file
    let totalChunks = 0;
    let totalBytes = 0;
    const startTime = performance.now();

    for (const filePath of files) {
      const { chunks, bytes } = await processFile(filePath, client, options);
      totalChunks += chunks;
      totalBytes += bytes;

      console.log(
        `✅ Processed: ${basename(filePath)} (${chunks} chunks, ${bytes} bytes)`
      );
    }

    const elapsed = (performance.now() - startTime) / 1000;
    printSummary(files, totalChunks, totalBytes, elapsed, options.dryRun);
  } catch (error) {
    console.error(`❌ Error:`, error);
    process.exit(1);
  } finally {
    if (client) {
      client.disconnect();
    }
  }
}

// Run the CLI
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
