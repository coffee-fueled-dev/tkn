# TKN CLI

A command-line tool for sending file content to the TKN server in configurable batches.

## Features

- 📁 **Glob Pattern Support**: Use fast-glob patterns to match multiple files
- 📦 **Configurable Batching**: Set custom batch sizes for optimal performance
- ⏱️ **Rate Control**: Configure intervals between batch sends
- 🔍 **Dry Run Mode**: Preview what would be sent without actually sending
- 📊 **Verbose Output**: Detailed logging for debugging and monitoring
- 🚀 **Built with Bun**: Fast execution and native TypeScript support

## Installation

```bash
# Build the CLI
bun run build

# The executable will be created as `tkn-send`
```

## Usage

```bash
./tkn-send <glob> [options]
```

### Arguments

- `glob` - File glob pattern (e.g., `"*.txt"`, `"data/**/*.json"`)

### Options

- `--batch-size <size>` - Number of items per batch (default: 100)
- `--interval <ms>` - Interval between batches in milliseconds (default: 1000)
- `--host <host>` - Server host (default: localhost)
- `--port <port>` - Server port (default: 3001)
- `--verbose` - Show detailed output
- `--dry-run` - Show what would be sent without actually sending
- `--help` - Show help message

## Examples

### Basic Usage

```bash
# Send all .txt files
./tkn-send "*.txt"

# Send all files in a directory recursively
./tkn-send "data/**/*"

# Send specific file types
./tkn-send "logs/*.log"
```

### Advanced Configuration

```bash
# Custom batch size and interval
./tkn-send "*.json" --batch-size 50 --interval 500

# Connect to remote server
./tkn-send "*.txt" --host production.server.com --port 3001

# Verbose output for debugging
./tkn-send "data/*.csv" --verbose

# Preview without sending (dry run)
./tkn-send "*.txt" --dry-run --verbose
```

### Real-world Examples

```bash
# Process log files in small batches with delays
./tkn-send "logs/*.log" --batch-size 25 --interval 2000

# Send large datasets efficiently
./tkn-send "datasets/**/*.json" --batch-size 200 --interval 100

# Debug configuration before processing
./tkn-send "important-data/*" --dry-run --verbose
```

## How It Works

1. **File Discovery**: Uses fast-glob to find files matching your pattern
2. **Content Reading**: Reads each file and splits content by lines
3. **Batch Creation**: Groups lines into batches of specified size
4. **Sequential Sending**: Sends batches to TKN server with configurable intervals
5. **Progress Tracking**: Shows progress and handles errors gracefully

## Data Format

The CLI sends data in the format expected by the TKN server:

```typescript
interface BatchItem {
  data: string | Uint8Array;
}

// Each batch is an array of BatchItem objects
type Batch = BatchItem[];
```

Each line from your files becomes a separate `BatchItem` with the line content as the `data` field.

## Integration with TKN Server

The CLI connects to the TKN socket server (default port 3001) and sends batches using the TKN client. The server will:

1. Parse each batch into individual items
2. Hash each item using the symbol table
3. Process items through the token miner
4. Store resulting tokens in Memgraph
5. Track performance metrics via the monitoring system

## Error Handling

- **Connection Errors**: Automatic retry and clear error messages
- **File Errors**: Individual file failures won't stop the entire process
- **Batch Errors**: Failed batches are reported but processing continues
- **Graceful Shutdown**: Proper cleanup on interruption

## Performance Tips

- **Batch Size**: Larger batches = fewer network calls, but more memory usage
- **Interval**: Shorter intervals = faster processing, but may overwhelm server
- **File Size**: Very large files are processed line-by-line to manage memory
- **Network**: Use `--verbose` to monitor send rates and adjust accordingly

## Monitoring

While the CLI is running, you can monitor server performance:

```bash
# Check server metrics
curl http://localhost:3000/metrics/summary

# Monitor in real-time
watch -n 2 'curl -s http://localhost:3000/metrics/summary'
```

## Development

```bash
# Run in development mode
bun run dev

# Test with dry run
bun src/index.ts "test-files/*.txt" --dry-run --verbose

# Build for production
bun run build
```
