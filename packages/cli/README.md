# TKN CLI Tool

A command-line interface for streaming files to the TKN server using the client library.

## Installation

```bash
cd scripts
bun install
```

## Usage

```bash
bun tkn-send.ts <glob-pattern> [options]
```

### Arguments

- `glob-pattern`: File pattern to match (e.g., `"**/*.txt"`, `"data/*.json"`)

### Options

- `--host <host>`: Server hostname (default: localhost)
- `--port <port>`: Server port (default: 4001)
- `--chunk-size <bytes>`: Chunk size for streaming (default: 1024)
- `--batch-size <count>`: Number of chunks per batch (default: 50)
- `--format <format>`: Force format: auto|text|binary|json (default: auto)
- `--verbose`: Enable verbose logging
- `--dry-run`: Show what would be sent without connecting
- `--help`: Show help

## Examples

### Basic Usage

```bash
# Send all text files in current directory
bun tkn-send.ts "*.txt"

# Send all files recursively
bun tkn-send.ts "**/*"

# Send specific file
bun tkn-send.ts "data/sample.json"
```

### Advanced Usage

```bash
# Custom server and port
bun tkn-send.ts "logs/*.log" --host 192.168.1.100 --port 4001

# Adjust performance settings
bun tkn-send.ts "data/*.csv" --chunk-size 2048 --batch-size 25

# Force JSON format for all files
bun tkn-send.ts "configs/*" --format json

# Verbose logging
bun tkn-send.ts "**/*.txt" --verbose

# Test without sending (dry run)
bun tkn-send.ts "**/*.json" --dry-run --verbose
```

## File Format Detection

The CLI automatically detects file formats based on extensions:

- **JSON**: `.json`, `.jsonl` → Parsed as JSON objects
- **Text**: `.txt`, `.log`, `.md`, `.csv`, `.yaml`, etc. → Sent as strings
- **Binary**: All other files → Sent as binary data

You can override detection with `--format <type>`.

## Performance

The CLI streams files in configurable chunks and batches them for efficient transmission:

- **Chunk Size**: How much data to read at once (default: 1024 bytes)
- **Batch Size**: How many chunks to send per batch (default: 50)

Adjust these based on your file sizes and network conditions.

## Testing the Complete System

1. **Start the TKN server stack:**

   ```bash
   cd .. # Go to project root
   docker-compose up -d
   ```

2. **Verify services are running:**

   ```bash
   docker-compose ps
   curl http://localhost:4000/metrics
   ```

3. **Test with the CLI:**

   ```bash
   cd scripts

   # Dry run first
   bun tkn-send.ts "test-data.txt" --dry-run --verbose

   # Send to server
   bun tkn-send.ts "test-data.txt" --verbose
   ```

4. **Monitor in Grafana:**
   - Open http://localhost:3002 (admin/admin)
   - View the TKN server dashboard
   - Watch metrics as you send data

## Troubleshooting

### Connection Issues

```bash
# Check if server is running
curl http://localhost:4000/health

# Check socket port is open
telnet localhost 4001
```

### Performance Issues

```bash
# Increase chunk size for large files
bun tkn-send.ts "large-file.txt" --chunk-size 8192

# Reduce batch size for memory constraints
bun tkn-send.ts "many-files/*" --batch-size 10
```

### Debug Mode

```bash
# Use dry-run to test patterns without connecting
bun tkn-send.ts "**/*.log" --dry-run --verbose

# Use verbose mode to see detailed progress
bun tkn-send.ts "data/*" --verbose
```

## Architecture

The CLI tool:

1. **File Discovery**: Uses `fast-glob` to find files matching patterns
2. **Streaming**: Uses Bun's native file streaming for memory efficiency
3. **Format Detection**: Automatically detects JSON, text, and binary formats
4. **Batching**: Groups chunks into batches for efficient transmission
5. **Client Library**: Uses the focused `TknNodeClient` for socket communication

This provides a complete end-to-end test of the TKN system from file ingestion to server processing.
