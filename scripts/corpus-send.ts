#!/usr/bin/env bun

import { existsSync } from "fs";
import { resolve } from "path";
import fg from "fast-glob";
import { TknClient, type BatchItem } from "tkn-client";
import { parseArgs } from "util";

interface CorpusOptions {
  socketUrl: string;
  httpUrl: string;
  verbose: boolean;
}

function showHelp() {
  console.log(`
🚀 TKN Corpus Send - Send files from the corpora directory

Usage:
  bun run corpus:send <path-relative-to-corpora> [options]

Options:
  --socket-url <url>    Socket server URL (default: localhost:4001)
  --http-url <url>      HTTP server URL (default: http://localhost:4000)
  --verbose             Show detailed output
  --help, -h            Show this help message

Examples:
  bun run corpus:send "brown-corpus/output/brown_gold_standard.txt"
  bun run corpus:send "tiny-stories-samples/output/*.txt"
  bun run corpus:send "**/*.txt" --verbose
  bun run corpus:send "brown-corpus/output/brown_unsegmented.txt" --socket-url localhost:4001

The path is relative to the corpora/ directory.
Environment variables TKN_SOCKET_URL and TKN_HTTP_URL are also supported.
`);
}

function parseCorpusArgs(): { relativePath: string; options: CorpusOptions } {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "socket-url": { type: "string", default: "" },
      "http-url": { type: "string", default: "" },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      h: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || values.h || positionals.length === 0) {
    showHelp();
    process.exit(0);
  }

  const relativePath = positionals[0];
  const socketUrl =
    values["socket-url"] || process.env.TKN_SOCKET_URL || "localhost:4001";
  const httpUrl =
    values["http-url"] || process.env.TKN_HTTP_URL || "http://localhost:4000";

  return {
    relativePath,
    options: {
      socketUrl,
      httpUrl,
      verbose: values.verbose as boolean,
    },
  };
}

async function streamFileContent(
  filePath: string,
  client: TknClient,
  verbose: boolean
): Promise<number> {
  const file = Bun.file(filePath);
  const stream = file.stream();

  let totalChars = 0;
  let buffer: BatchItem[] = [];
  const CHUNK_SIZE = 1024; // Send in reasonable chunks

  try {
    for await (const chunk of stream) {
      const chunkStr = new TextDecoder().decode(chunk);

      // Convert chunk characters to batch items
      for (const char of chunkStr) {
        buffer.push({ data: char });
        totalChars++;

        // Send when we have a reasonable chunk
        if (buffer.length >= CHUNK_SIZE) {
          await client.sendBatch(buffer);
          if (verbose) {
            process.stdout.write(`📤 Sent ${totalChars} chars\r`);
          }
          buffer = [];
        }
      }
    }

    // Send any remaining characters
    if (buffer.length > 0) {
      await client.sendBatch(buffer);
      if (verbose) {
        process.stdout.write(`📤 Sent ${totalChars} chars\r`);
      }
    }

    if (verbose) {
      console.log(`\n✅ Completed ${filePath}: ${totalChars} characters`);
    }

    return totalChars;
  } catch (error) {
    console.error(`❌ Error streaming ${filePath}:`, error);
    throw error;
  }
}

async function main() {
  const { relativePath, options } = parseCorpusArgs();

  // Construct the full path relative to corpora
  const corporaPath = `corpora/${relativePath}`;

  // Check if it's a glob pattern or if the file/directory exists
  const fullPath = resolve(corporaPath);
  const isGlob = relativePath.includes("*") || relativePath.includes("?");

  if (!isGlob && !existsSync(fullPath)) {
    console.error(`❌ File or directory not found: ${corporaPath}`);
    console.error(`   Full path: ${fullPath}`);
    process.exit(1);
  }

  console.log("🚀 TKN Corpus Send - Streaming file content...");

  if (options.verbose) {
    console.log(`📋 Configuration:
  Corpus path: ${corporaPath}
  Socket Server: ${options.socketUrl}
  HTTP Server: ${options.httpUrl}`);
  }

  // Find files matching the pattern
  console.log(`🔍 Finding files matching: ${corporaPath}`);
  const files = await fg(corporaPath, { onlyFiles: true });

  if (files.length === 0) {
    console.log("❌ No files found matching the pattern");
    process.exit(1);
  }

  console.log(`📁 Found ${files.length} file(s)`);
  if (options.verbose) {
    files.forEach((file) => console.log(`  - ${file}`));
  }

  // Connect to server
  const client = new TknClient({
    socketUrl: options.socketUrl,
    httpUrl: options.httpUrl,
    onConnect: () => {
      if (options.verbose) {
        console.log(`🔗 Connected to ${options.socketUrl}`);
      }
    },
    onDisconnect: () => {
      if (options.verbose) {
        console.log("🔌 Disconnected from server");
      }
    },
    onError: (error) => {
      console.error("❌ Connection error:", error);
    },
  });

  try {
    console.log(`🔗 Connecting to ${options.socketUrl}...`);
    await client.connect();

    if (options.verbose) {
      console.log("✅ Server is ready, starting stream...");
    }

    console.log("📤 Streaming data...");
    let totalChars = 0;
    const startTime = performance.now();

    for (const file of files) {
      const chars = await streamFileContent(file, client, options.verbose);
      totalChars += chars;
    }

    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;
    const throughput = totalChars / duration;

    console.log(`\n📊 Stream completed:`);
    console.log(`  Total characters: ${totalChars.toLocaleString()}`);
    console.log(`  Duration: ${duration.toFixed(2)}s`);
    console.log(
      `  Throughput: ${Math.round(throughput).toLocaleString()} chars/sec`
    );
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("💥 Unexpected error:", error);
    process.exit(1);
  });
}
