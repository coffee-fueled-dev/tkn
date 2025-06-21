#!/usr/bin/env bun

import { parseArgs } from "util";
import fg from "fast-glob";
import { TknClient, type BatchItem } from "tkn-client";

interface CliOptions {
  command: "send" | "replay" | "help";
  globOrSessionId: string;
  httpUrl: string;
  socketUrl: string;
  verbose: boolean;
}

function showHelp() {
  console.log(`
TKN CLI - Send file content to TKN server or replay a session

Usage:
  tkn <command> [args] [options]

Commands:
  send <glob>           Send file(s) matching the glob pattern.
  replay <session-id>   Replay and print the content of a completed session.
  help                  Show this help message.

Global Options:
  --http-url <url>      HTTP server URL for replay (default: from TKN_HTTP_URL env or http://localhost:4000)
  --socket-url <url>    Socket server URL for sending data (default: from TKN_SOCKET_URL env or localhost:4001)
  --verbose             Show detailed output

Environment Variables:
  TKN_HTTP_URL          HTTP server URL for replay
  TKN_SOCKET_URL        Socket server host:port for sending data

Examples:
  tkn send "*.txt"                           # Send all .txt files
  tkn send "data/**/*.json"                  # Send JSON files
  tkn replay "some-session-id-12345"         # Replay a session
`);
}

function parseCliArgs(): CliOptions {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "http-url": { type: "string", default: "" },
      "socket-url": { type: "string", default: "" },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const command = (positionals[0] || "help") as CliOptions["command"];

  if (
    values.help ||
    command === "help" ||
    (command !== "replay" && positionals.length < 2)
  ) {
    return {
      command: "help",
      globOrSessionId: "",
      httpUrl: process.env.TKN_HTTP_URL || "http://localhost:4000",
      socketUrl: process.env.TKN_SOCKET_URL || "localhost:4001",
      verbose: false,
    };
  }

  const httpUrl =
    values["http-url"] || process.env.TKN_HTTP_URL || "http://localhost:4000";
  const socketUrl =
    values["socket-url"] || process.env.TKN_SOCKET_URL || "localhost:4001";

  return {
    command,
    globOrSessionId: positionals[1] || "",
    httpUrl,
    socketUrl,
    verbose: values.verbose as boolean,
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

async function handleSendCommand(options: CliOptions) {
  console.log("🚀 TKN CLI - Streaming file content...");

  if (options.verbose) {
    console.log(`📋 Configuration:
  Glob: ${options.globOrSessionId}
  Socket Server: ${options.socketUrl}
  HTTP Server: ${options.httpUrl}`);
  }

  // Find files matching the glob pattern
  console.log(`🔍 Finding files matching: ${options.globOrSessionId}`);
  const files = await fg(options.globOrSessionId, { onlyFiles: true });

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

async function handleReplayCommand(options: CliOptions) {
  console.log("🚀 TKN CLI starting in 'replay' mode...");
  const { globOrSessionId: sessionId, httpUrl, socketUrl, verbose } = options;

  if (!sessionId) {
    console.error("❌ Session ID is required for replay.");
    showHelp();
    process.exit(1);
  }

  if (verbose) {
    console.log(`📋 Configuration:
  Session ID: ${sessionId}
  HTTP Server: ${httpUrl}
  Environment Variables:
    TKN_HTTP_URL: ${process.env.TKN_HTTP_URL || "(not set)"}
    TKN_SOCKET_URL: ${process.env.TKN_SOCKET_URL || "(not set)"}`);
  }

  const client = new TknClient({
    socketUrl: socketUrl,
    httpUrl: httpUrl,
    onError: (error) => {
      console.error("❌ Client error:", error.message);
    },
  });

  try {
    console.log(`🔍 Replaying session: ${sessionId}`);
    const reconstructedData = await client.replay(sessionId);

    // Create a colorful delimiter for token separation
    const colorfulDelimiter = "\x1b[36m|\x1b[0m"; // Cyan pipe character
    const fullText = reconstructedData.join(colorfulDelimiter);

    console.log("\n--- Reconstructed Session Content ---");
    console.log(fullText);
    console.log("-------------------------------------\n");
    console.log(
      `✅ Replay completed. Total characters: ${
        reconstructedData.join("").length
      }`
    );
  } catch (error) {
    // Client's onError will already log the message
    process.exit(1);
  }
}

async function main() {
  const options = parseCliArgs();

  switch (options.command) {
    case "send":
      await handleSendCommand(options);
      break;
    case "replay":
      await handleReplayCommand(options);
      break;
    case "help":
    default:
      showHelp();
      process.exit(0);
  }
}

// Run the CLI
main().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});
