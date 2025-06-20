#!/usr/bin/env bun

import { parseArgs } from "util";
import fg from "fast-glob";
import { readFile } from "fs/promises";
import { TknClient, type BatchItem } from "tkn-client";

interface CliOptions {
  glob: string;
  batchSize: number;
  interval: number;
  host: string;
  port: number;
  verbose: boolean;
  dryRun: boolean;
  help: boolean;
}

function showHelp() {
  console.log(`
TKN CLI - Send file content to TKN server in batches

Usage:
  tkn-send <glob> [options]

Arguments:
  glob                  File glob pattern (e.g., "*.txt", "data/**/*.json")

Options:
  --batch-size <size>   Number of items per batch (default: 100)
  --interval <ms>       Interval between batches in milliseconds (default: 1000)
  --host <host>         Server host (default: localhost)
  --port <port>         Server port (default: 3001)
  --verbose             Show detailed output
  --dry-run             Show what would be sent without actually sending
  --help                Show this help message

Examples:
  tkn-send "*.txt"                           # Send all .txt files
  tkn-send "data/**/*.json" --batch-size 50  # Send JSON files in batches of 50
  tkn-send "logs/*.log" --interval 500       # Send with 500ms interval
  tkn-send "*.txt" --dry-run --verbose       # Preview what would be sent
`);
}

function parseCliArgs(): CliOptions {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "batch-size": { type: "string", default: "100" },
      interval: { type: "string", default: "1000" },
      host: { type: "string", default: "localhost" },
      port: { type: "string", default: "3001" },
      verbose: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    return {
      glob: "",
      batchSize: 100,
      interval: 1000,
      host: "localhost",
      port: 3001,
      verbose: false,
      dryRun: false,
      help: true,
    };
  }

  return {
    glob: positionals[0],
    batchSize: parseInt(values["batch-size"] as string),
    interval: parseInt(values.interval as string),
    host: values.host as string,
    port: parseInt(values.port as string),
    verbose: values.verbose as boolean,
    dryRun: values["dry-run"] as boolean,
    help: false,
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

    // Split content by lines and create batch items
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return lines.map((line) => ({ data: line }));
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

async function main() {
  const options = parseCliArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log("🚀 TKN CLI starting...");

  if (options.verbose) {
    console.log(`📋 Configuration:
  Glob: ${options.glob}
  Batch size: ${options.batchSize}
  Interval: ${options.interval}ms
  Server: ${options.host}:${options.port}
  Dry run: ${options.dryRun}`);
  }

  // Find files matching the glob pattern
  console.log(`🔍 Finding files matching: ${options.glob}`);
  const files = await fg(options.glob, { onlyFiles: true });

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
    `📦 Created ${batches.length} batch(es) of max ${options.batchSize} items each`
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
    host: options.host,
    port: options.port,
    onConnect: () => {
      if (options.verbose) {
        console.log(`🔗 Connected to ${options.host}:${options.port}`);
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
    console.log(`🔗 Connecting to ${options.host}:${options.port}...`);
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

// Run the CLI
main().catch((error) => {
  console.error("💥 Unexpected error:", error);
  process.exit(1);
});
