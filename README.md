# TKN - Token Processing Protocol and Implementation

TKN is a lightweight, high-performance token processing system consisting of a binary communication protocol, a server implementation for token processing and storage, and client libraries for both Node.js/Bun and browser environments.

## Overview

The TKN project provides a complete solution for token-based data processing:

- **Protocol**: A lightweight binary protocol for efficient data transmission
- **Server**: A high-performance token processing server with Neo4j/Memgraph integration
- **Client Libraries**: Easy-to-use client libraries for various environments

The system is designed to handle real-time token sequence processing, with efficient batch handling and automatic session management. It's built with performance in mind, using Bun as the runtime environment for the server.

## Components

### TKN Protocol

The TKN protocol is a simple binary protocol with the following format:

```
+------+----------------+-----------------------+
| Type | Length (4byte) | Payload (variable)    |
+------+----------------+-----------------------+
   1B        4B             Length bytes
```

### Message Types

- `1`: JSON data
- `2`: String data
- `3`: Binary data
- `4`: Batch data (contains multiple messages of other types)

### Length Field

The length field is a 4-byte big-endian integer that specifies the length of the payload in bytes.

### Batch Message Format

When sending a batch (type `4`), the payload contains multiple items, each with its own type and length:

```
+------+----------------+--------------+--------------+...+--------------+--------------+
| Type | Total Length   | Item1 Type   | Item1 Length | ...| ItemN Type   | ItemN Length |
+------+----------------+--------------+--------------+...+--------------+--------------+
| Item1 Payload         | ... | ItemN Payload         |
+------------------------+...+------------------------+
```

This allows sending multiple messages of different types in a single packet, reducing network overhead.

## Server

The server processes incoming messages according to the protocol, parses them based on the message type, and then processes them through the token mining system.

### Key Features

- Real-time token sequence processing and parsing
- Neo4j/Memgraph database integration for token storage
- Prometheus metrics monitoring
- WebSocket-based communication
- Efficient token batch processing
- Automatic session management

### Running the Server

```bash
bun run server/src/index.ts
```

## TKN Client Library

A lightweight client library is included for easy communication with the TKN server:

- `client/src/client.ts`: Node.js/Bun client library
- `client/src/client.ts`: Browser-compatible client using WebSockets

### Using the Node.js Client

```typescript
import { TknNodeClient } from "./client/src/client";

// Create a client
const client = new TknNodeClient({
  host: "localhost",
  port: 8080,
  onConnect: (client) => {
    console.log("Connected to TKN server!");

    // Send JSON data
    client.sendJson({ type: "sensor", values: [42, 17, 23, 84] });

    // Send string data
    client.sendString("Hello from TKN client!");

    // Send binary data
    client.sendBinary(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));

    // Send batch data (combining multiple message types)
    client.sendBatch([
      {
        type: 1, // JSON
        data: { type: "sensor", values: [42, 17, 23, 84] },
      },
      {
        type: 2, // String
        data: "Log message from batch",
      },
      {
        type: 3, // Binary
        data: new Uint8Array([1, 2, 3, 4, 5]),
      },
    ]);
  },
});

// Connect to the server
client.connect();
```

### Using the Browser Client

```html
<script type="module">
  import { TknBrowserClient } from "./client/src/client.js";

  const client = new TknBrowserClient({
    url: "ws://localhost:8080",
    onConnect: (client) => {
      console.log("Connected to TKN server!");

      // Send JSON data
      client.sendJson({ type: "sensor", values: [42, 17, 23, 84] });

      // Send a batch of mixed data
      client.sendBatch([
        { type: 1, data: { event: "login", user: "user123" } },
        { type: 2, data: "System initialized" },
      ]);
    },
  });

  client.connect();
</script>
```

### Client API

Both client libraries share a similar API:

- `connect()`: Connect to the TKN server
- `disconnect()`: Close the connection
- `sendJson(data)`: Send JSON data
- `sendString(data)`: Send string data
- `sendBinary(data)`: Send binary data
- `sendBatch(items)`: Send multiple items of different types in a single message
- `isConnected()`: Check connection status

## Project Structure

```
├── client/               # Client implementation
│   ├── src/              # Client source code
│   │   ├── client.ts     # Client implementation
│   │   ├── common.ts     # Shared utilities and types
│   │   └── index.ts      # Entry point
│   └── examples/         # Client usage examples
├── server/               # Server implementation
│   ├── src/              # Server source code
│   │   ├── lib/          # Server libraries
│   │   │   ├── tkn-server.ts    # Main server implementation
│   │   │   ├── tkn-miner.ts     # Token mining logic
│   │   │   ├── sync-stream.ts   # Token batch processing
│   │   │   └── metrics-server.ts # Prometheus metrics
│   │   └── index.ts      # Server entry point
```

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   cd server && bun install
   cd ../client && bun install
   ```
3. Configure the server environment (see server/README.md)
4. Start the server:
   ```bash
   cd server && bun run dev
   ```
5. Run a client example:
   ```bash
   cd client && bun run examples/tkn-client-demo.ts
   ```

## License

[Add your license information here]
