# TKN Client

A lightweight, cross-platform client library for communicating with the TKN server using the TKN binary protocol. The client provides an easy-to-use API for both Node.js/Bun and browser environments.

## Role in the TKN System

The TKN Client serves as the communication layer for applications that need to interact with the TKN server:

- Implements the TKN binary protocol for efficient message transmission
- Provides a unified API for both Node.js/Bun and browser environments
- Handles connection management, reconnection, and error handling
- Offers easy methods for sending different types of data (JSON, string, binary, batch)

## Installation

To install dependencies:

```bash
bun install
```

## Usage

### Node.js/Bun Client

```typescript
import { TknNodeClient } from "./src/client";

const client = new TknNodeClient({
  host: "localhost",
  port: 8080,
  onConnect: (client) => {
    console.log("Connected to TKN server!");

    // Send JSON data
    client.sendJson({ type: "data", value: 42 });

    // Send string data
    client.sendString("Hello TKN!");
  },
  onError: (error) => {
    console.error("Connection error:", error);
  },
});

client.connect();
```

### Browser Client

```javascript
import { TknBrowserClient } from "./src/client";

const client = new TknBrowserClient({
  url: "ws://localhost:8080",
  onConnect: (client) => {
    console.log("Connected to TKN server!");

    // Send batch data
    client.sendBatch([
      { type: 1, data: { event: "login" } },
      { type: 2, data: "User login successful" },
    ]);
  },
});

client.connect();
```

## API Reference

### Client Creation

- `new TknNodeClient(options)` - Create a Node.js/Bun client
- `new TknBrowserClient(options)` - Create a browser client

### Connection Methods

- `connect()` - Connect to the TKN server
- `disconnect()` - Disconnect from the server
- `isConnected()` - Check if connected to the server

### Sending Methods

- `sendJson(data)` - Send JSON data (type 1)
- `sendString(data)` - Send string data (type 2)
- `sendBinary(data)` - Send binary data (type 3)
- `sendBatch(items)` - Send batch data (type 4) containing multiple items

### Configuration Options

- `host` - Server hostname (Node.js/Bun client)
- `port` - Server port (Node.js/Bun client)
- `url` - WebSocket URL (Browser client)
- `onConnect` - Connection callback
- `onData` - Data received callback
- `onError` - Error callback
- `onClose` - Connection closed callback
- `autoReconnect` - Enable automatic reconnection
- `reconnectInterval` - Reconnection attempt interval

## Examples

See the `examples/` directory for more usage examples.

## Running the Examples

```bash
bun run examples/tkn-client-demo.ts
```

## License

[Add your license information here]
