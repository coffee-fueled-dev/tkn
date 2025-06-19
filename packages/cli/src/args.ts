import { parseArgs } from "util";
import type { CliOptions } from "./types.js";
import { DEFAULT_OPTIONS } from "./types.js";

export function printUsage(): void {
  console.log(`
TKN Send CLI - Stream files to TKN server

Usage:
  bun src/index.ts <glob-pattern> [options]

Arguments:
  glob-pattern          File pattern to match (e.g., "**/*.txt", "data/*.json")

Options:
  --host <host>         Server hostname (default: localhost)
  --port <port>         Server port (default: 4001)
  --chunk-size <bytes>  Chunk size for streaming (default: 1024)
  --batch-size <count>  Number of chunks per batch (default: 50)
  --format <format>     Force format: auto|text|binary|json (default: auto)
  --verbose             Enable verbose logging
  --dry-run             Show what would be sent without connecting
  --help                Show this help

Examples:
  bun src/index.ts "**/*.txt"
  bun src/index.ts "data/*.json" --host localhost --port 4001
  bun src/index.ts "logs/*.log" --chunk-size 2048 --batch-size 25 --verbose
  bun src/index.ts "config.json" --format json --dry-run
`);
}

export function parseCliArgs(): { pattern: string; options: CliOptions } {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      host: { type: "string" },
      port: { type: "string" },
      "chunk-size": { type: "string" },
      "batch-size": { type: "string" },
      format: { type: "string" },
      verbose: { type: "boolean" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    printUsage();
    process.exit(values.help ? 0 : 1);
  }

  const pattern = positionals[0];
  const options: CliOptions = {
    host: values.host || DEFAULT_OPTIONS.host,
    port: values.port ? parseInt(values.port, 10) : DEFAULT_OPTIONS.port,
    chunkSize: values["chunk-size"]
      ? parseInt(values["chunk-size"], 10)
      : DEFAULT_OPTIONS.chunkSize,
    batchSize: values["batch-size"]
      ? parseInt(values["batch-size"], 10)
      : DEFAULT_OPTIONS.batchSize,
    format: (values.format as CliOptions["format"]) || DEFAULT_OPTIONS.format,
    verbose: values.verbose || DEFAULT_OPTIONS.verbose,
    dryRun: values["dry-run"] || DEFAULT_OPTIONS.dryRun,
  };

  return { pattern, options };
}
