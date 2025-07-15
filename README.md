# TKN Monorepo

A high-performance tokenization system with client library, server, and CLI tools built with Bun workspaces.

## Architecture

This monorepo contains three packages:

- **`packages/server`** - TKN server with Memgraph integration, metrics, and pattern mining
- **`packages/client`** - Focused client libraries for browser and Node.js environments
- **`packages/cli`** - Command-line tool for streaming files to the TKN server

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0.0
- [Docker](https://docker.com/) for running the server stack

### Installation

```bash
# Install all dependencies
bun install

# Or use the workspace script
bun run install:all
```

### Running the Complete System

1. **Start the server stack:**

   ```bash
   bun run docker:up
   ```

2. **Verify services are running:**

   ```bash
   bun run docker:logs
   # Check health endpoints
   curl http://localhost:4000/health
   curl http://localhost:4000/metrics
   ```

3. **Test with the CLI:**

   ```bash
   # Test with sample files (dry run)
   bun run test:cli-files

   # Send actual data to server
   bun packages/cli/src/index.ts "test-files/*.txt" --verbose
   ```

4. **Monitor in Grafana:**
   - Open http://localhost:3002 (admin/admin)
   - View the TKN server dashboard
   - Watch metrics as you send data

## Workspace Scripts

### Development

```bash
# Start individual services in development mode
bun run dev:server    # Start TKN server with hot reload
bun run dev:client    # Start client development mode
bun run dev:cli       # Start CLI development mode
```

### Testing

```bash
# Test individual components
bun run test:server   # Start server
bun run test:client   # Run client example (requires server)
bun run test:cli      # Show CLI help
bun run test:cli-dry  # Test CLI with sample files (dry run)
bun run test:cli-files # Test CLI with all test files
```

### Docker Management

```bash
bun run docker:up     # Start all services
bun run docker:down   # Stop all services
bun run docker:logs   # View service logs
```

### Utilities

```bash
bun run build        # Build all packages
bun run clean        # Clean all node_modules and dist folders
```

## Package Details

### TKN Server (`packages/server`)

High-performance server with:

- **Database I/O Optimization**: UNWIND batch operations (10-50x faster)
- **Hash Optimization**: Eliminated MD5 bottleneck (3-5x faster)
- **Memgraph Integration**: Graph database for pattern storage
- **Prometheus Metrics**: Comprehensive observability
- **Docker Support**: Production-ready containerization

**Key Features:**

- Socket server on port 4001 for data ingestion
- HTTP server on port 4000 for health/metrics
- Batch processing with configurable sizes
- Symbol table with cyrb53 hashing
- Pattern mining algorithms

### TKN Client (`packages/client`)

Focused client libraries with:

- **Environment-Specific**: Separate browser and Node.js clients
- **Protocol Compatibility**: 100% compatible encoding/decoding
- **Self-Documenting**: Semantic method names
- **Tree-Shakeable**: Minimal bundle sizes
- **TypeScript**: Full type safety

**Exports:**

```typescript
// Node.js environments
import { TknNodeClient } from "tkn-client/node";

// Browser environments
import { TknBrowserClient } from "tkn-client/browser";

// Protocol constants
import { TYPE_STRING, TYPE_BINARY, TYPE_JSON, TYPE_BATCH } from "tkn-client";
```

### TKN CLI (`packages/cli`)

Modular CLI tool with:

- **File Streaming**: Efficient chunk-based processing
- **Format Detection**: Auto-detect JSON, text, binary formats
- **Batch Processing**: Configurable batch sizes
- **Glob Patterns**: Support for complex file patterns
- **Dry Run Mode**: Test without connecting to server

**Modular Structure:**

```
packages/cli/src/
├── index.ts          # Main CLI entry point
├── types.ts          # TypeScript interfaces
├── args.ts           # Argument parsing
├── file-utils.ts     # File format detection & streaming
├── client.ts         # Server connection & communication
└── processor.ts      # File processing logic
```

## Performance Optimizations

### Database I/O (10-50x improvement)

- **Before**: N+1 queries (500+ individual database operations)
- **After**: 2 batch queries using UNWIND syntax
- **Impact**: Massive reduction in database round trips

### Hash Computation (3-5x improvement)

- **Before**: Double hashing with slow MD5
- **After**: Single fast cyrb53 hash with base64 encoding
- **Impact**: Eliminated cryptographic overhead in hot path

### Client Architecture

- **Before**: Unified client with runtime detection
- **After**: Focused clients with compile-time optimization
- **Impact**: Smaller bundles, better tree-shaking, clearer APIs

## Protocol Specification

### TKN Message Format

```
+------+----------------+------------------+
| Type | Length (4 bytes) | Payload         |
+------+----------------+------------------+
```

- **Type**: 1=JSON, 2=STRING, 3=BINARY, 4=BATCH
- **Length**: Big-endian 32-bit payload size
- **Header**: 5 bytes total

### Network Configuration

- **Socket Server**: localhost:4001 (data ingestion)
- **HTTP Server**: localhost:4000 (health/metrics)
- **Memgraph**: localhost:7687 (database)
- **Prometheus**: localhost:9091 (metrics)
- **Grafana**: localhost:3002 (dashboards)

## Examples

### CLI Usage

```bash
# Basic file sending
bun packages/cli/src/index.ts "data/*.txt"

# Custom server and performance settings
bun packages/cli/src/index.ts "logs/*.log" \
  --host production-server \
  --port 4001 \
  --chunk-size 2048 \
  --batch-size 25 \
  --verbose

# Force format and dry run
bun packages/cli/src/index.ts "configs/*" \
  --format json \
  --dry-run \
  --verbose
```

### Client Usage

```typescript
// Node.js client
import { TknNodeClient } from "tkn-client";

const client = new TknNodeClient({
  host: "localhost",
  port: 4001,
  onConnect: () => console.log("Connected!"),
  onError: (err) => console.error("Error:", err),
});

await client.connect();
client.sendBatch([
  { type: TYPE_STRING, data: "Hello, TKN!" },
  { type: TYPE_JSON, data: { message: "JSON data" } },
]);
```

## Contributing

This project uses Bun workspaces for dependency management. All packages share the same TypeScript configuration and development tools.

### Development Workflow

1. **Make changes** in the appropriate package
2. **Test locally** using workspace scripts
3. **Test integration** with Docker stack
4. **Verify performance** with CLI tool

### Code Style

- **Self-documenting method names** instead of comments
- **Focused modules** with single responsibilities
- **TypeScript strict mode** for type safety
- **Semantic imports** for clear dependencies

## License

MIT License - see individual packages for details.
