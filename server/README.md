# TKN Server

A high-performance token processing server component of the TKN system. This server is responsible for receiving, processing, and storing token sequences in a Neo4j/Memgraph database.

## Role in the TKN System

The TKN Server serves as the backend for the TKN protocol implementation:

- Receives and processes messages using the TKN binary protocol
- Mines token sequences from data streams using a custom token mining algorithm
- Stores processed tokens in Neo4j/Memgraph for analysis and retrieval
- Provides real-time processing with WebSocket communication
- Monitors performance metrics using Prometheus

## Features

- Real-time token sequence processing and parsing
- Neo4j/Memgraph database integration for token storage
- Prometheus metrics monitoring
- WebSocket-based communication
- Efficient token batch processing
- Automatic session management

## Prerequisites

- [Bun](https://bun.sh) v1.2.1 or higher
- Neo4j/Memgraph database
- Node.js environment

## Installation

To install dependencies:

```bash
bun install
```

## Configuration

The server requires the following environment variables:

```env
MEMGRAPH_URI=<your-memgraph-uri>
MEMGRAPH_USER=<your-memgraph-username>
MEMGRAPH_PASS=<your-memgraph-password>
MEMGRAPH_DB_NAME=<your-database-name>
TKN_PORT=8080              # Default port for the main server
METRICS_PORT=4000          # Default port for Prometheus metrics
NODE_ENV=development       # or production
```

## Running the Server

### Development Mode

```bash
bun run dev
```

This will start the server in watch mode, automatically restarting on file changes.

### Production Mode

```bash
bun run start
```

## Monitoring

The server exposes Prometheus metrics at `http://localhost:4000/metrics`. Key metrics include:

- Operation throughput
- Latency measurements
- Error counts
- Dependency call tracking

## Architecture

The server consists of several key components:

- **TknServer**: Main server implementation that handles socket connections and message processing
- **TknMiner**: Processes incoming data buffers and identifies token sequences
- **SyncStream**: Handles token batch processing and database storage
- **SymbolTable**: Manages token symbol resolution and mapping
- **Metrics Server**: Provides Prometheus metrics endpoint

## Core Files

- `src/index.ts`: Entry point for the server
- `src/lib/tkn-server.ts`: Main server implementation
- `src/lib/tkn-miner.ts`: Token mining logic
- `src/lib/sync-stream.ts`: Token batch processing
- `src/lib/metrics-server.ts`: Prometheus metrics server

## License

[Add your license information here]
