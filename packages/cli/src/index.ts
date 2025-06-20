#!/usr/bin/env bun

import { parseArgs } from "util";
import fg from "fast-glob";
import { readFile } from "fs/promises";
import { TknClient, type BatchItem } from "tkn-client";

interface CliOptions {
  command: "send" | "replay" | "help";
  globOrSessionId: string;
  batchSize: number;
  interval: number;
  httpUrl: string;
  socketUrl: string;
  verbose: boolean;
  dryRun: boolean;
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

Options for 'send' command only:
  --batch-size <size>   Number of items per batch (default: 100)
  --interval <ms>       Interval between batches in milliseconds (default: 1000)
  --dry-run             Show what would be sent without actually sending

Environment Variables:
  TKN_HTTP_URL          HTTP server URL for replay
  TKN_SOCKET_URL        Socket server host:port for sending data

Examples:
  tkn send "*.txt"                           # Send all .txt files
  tkn send "data/**/*.json" --batch-size 50  # Send JSON files in batches of 50
  tkn replay "some-session-id-12345"         # Replay a session
`);
}

function parseCliArgs(): CliOptions {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "batch-size": { type: "string", default: "100" },
      interval: { type: "string", default: "1000" },
      "http-url": { type: "string", default: "" },
      "socket-url": { type: "string", default: "" },
      verbose: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
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
      batchSize: 100,
      interval: 1000,
      httpUrl: process.env.TKN_HTTP_URL || "http://localhost:4000",
      socketUrl: process.env.TKN_SOCKET_URL || "localhost:4001",
      verbose: false,
      dryRun: false,
    };
  }

  const httpUrl =
    values["http-url"] || process.env.TKN_HTTP_URL || "http://localhost:4000";
  const socketUrl =
    values["socket-url"] || process.env.TKN_SOCKET_URL || "localhost:4001";

  return {
    command,
    globOrSessionId: positionals[1] || "",
    batchSize: parseInt(values["batch-size"] as string),
    interval: parseInt(values.interval as string),
    httpUrl,
    socketUrl,
    verbose: values.verbose as boolean,
    dryRun: values["dry-run"] as boolean,
  };
}

async function readFileContent(
  filePath: string,
  verbose: boolean
): Promise<BatchItem[]> {
  try {
    const content = await readFile(filePath, "utf8");

    if (verbose) {
      console.log(`📄 Read ${filePath} (${content.length} characters)`);
    }

    // Convert each character to a batch item for TKN algorithm
    // The TKN algorithm expects individual discrete data items (characters)
    const characters = Array.from(content);

    return characters.map((char) => ({ data: char }));
  } catch (error) {
    console.error(`❌ Error reading ${filePath}:`, error);
    return [];
  }
}

function createBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

async function sendBatches(
  client: TknClient,
  batches: BatchItem[][],
  interval: number,
  verbose: boolean,
  dryRun: boolean
): Promise<void> {
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    if (dryRun) {
      console.log(
        `🔍 [DRY RUN] Batch ${i + 1}/${batches.length} (${batch.length} items)`
      );
      if (verbose) {
        batch.slice(0, 3).forEach((item, idx) => {
          const preview =
            typeof item.data === "string"
              ? item.data.slice(0, 50) + (item.data.length > 50 ? "..." : "")
              : `[Binary data: ${item.data.length} bytes]`;
          console.log(`   ${idx + 1}. ${preview}`);
        });
        if (batch.length > 3) {
          console.log(`   ... and ${batch.length - 3} more items`);
        }
      }
    } else {
      try {
        await client.sendBatch(batch);
        if (verbose) {
          console.log(
            `✅ Sent batch ${i + 1}/${batches.length} (${batch.length} items)`
          );
        } else {
          process.stdout.write(`📤 Sent batch ${i + 1}/${batches.length}\r`);
        }
      } catch (error) {
        console.error(`❌ Error sending batch ${i + 1}:`, error);
        throw error;
      }
    }

    // Wait before sending next batch (except for the last one)
    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  if (!verbose && !dryRun) {
    console.log(); // New line after progress
  }
}

async function handleSendCommand(options: CliOptions) {
  console.log("🚀 TKN CLI starting in 'send' mode...");

  if (options.verbose) {
    console.log(`📋 Configuration:
  Glob: ${options.globOrSessionId}
  Batch size: ${options.batchSize}
  Interval: ${options.interval}ms
  Socket Server: ${options.socketUrl}
  HTTP Server: ${options.httpUrl}
  Environment Variables:
    TKN_SOCKET_URL: ${process.env.TKN_SOCKET_URL || "(not set)"}
    TKN_HTTP_URL: ${process.env.TKN_HTTP_URL || "(not set)"}
  Dry run: ${options.dryRun}`);
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

  // Read all file contents
  console.log("📖 Reading file contents...");
  const allItems: BatchItem[] = [];

  for (const file of files) {
    const items = await readFileContent(file, options.verbose);
    allItems.push(...items);
  }

  if (allItems.length === 0) {
    console.log("❌ No content found in files");
    process.exit(1);
  }

  console.log(`📊 Total items to send: ${allItems.length}`);

  // Create batches
  const batches = createBatches(allItems, options.batchSize);
  console.log(
    ` Created ${batches.length} batch(es) of max ${options.batchSize} items each`
  );

  if (options.dryRun) {
    console.log("🔍 DRY RUN MODE - No data will be sent");
    await sendBatches(
      null as any,
      batches,
      options.interval,
      options.verbose,
      true
    );
    console.log("✅ Dry run completed");
    return;
  }

  // Connect to server and send batches
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

    console.log("📤 Sending batches...");
    await sendBatches(
      client,
      batches,
      options.interval,
      options.verbose,
      false
    );

    console.log("✅ All batches sent successfully");
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
