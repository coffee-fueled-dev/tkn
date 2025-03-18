# tkn-api-server

A high-performance token processing server built with Bun, featuring real-time token sequence parsing, Neo4j database integration, and Prometheus metrics monitoring.

## Features

- Real-time token sequence processing and parsing
- Neo4j database integration for token storage
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

- **Observer**: Processes incoming data buffers and identifies token sequences
- **SyncStream**: Handles token batch processing and database storage
- **Metrics Server**: Provides Prometheus metrics endpoint
- **WebSocket Server**: Manages real-time client connections

## License

[Add your license information here]
