# TKN Client Library

Focused, self-documenting clients for the TKN binary protocol. Choose the right client for your environment.

## Architecture

This library provides **two focused clients** instead of a unified abstraction:

- **`TknBrowserClient`** - WebSocket-based client for browser environments
- **`TknNodeClient`** - Socket-based client for Node.js/Bun server environments

## Installation

```bash
bun add @tkn/client
```

## Usage

### Browser Client

```typescript
import { TknBrowserClient } from "@tkn/client/browser";

const client = new TknBrowserClient({
  url: "ws://localhost:4001",
  onConnect: (client) => console.log("Connected!"),
  onData: (data) => console.log("Received:", data),
  onError: (error) => console.error("Error:", error),
  onClose: (event) => console.log("Disconnected"),
});

await client.connect();

// Send different data types
client.sendJson({ message: "Hello", timestamp: Date.now() });
client.sendString("Hello TKN!");
client.sendBinary(new Uint8Array([1, 2, 3, 4]));

// Send mixed batch
client.sendBatch([
  { type: TYPE_STRING, data: "First item" },
  { type: TYPE_JSON, data: { batch: true } },
  { type: TYPE_BINARY, data: new Uint8Array([5, 6, 7, 8]) },
]);
```

### Node/Bun Client

```typescript
import { TknNodeClient } from "@tkn/client/node";

const client = new TknNodeClient({
  host: "localhost",
  port: 4001,
  onConnect: (client) => console.log("Connected!"),
  onData: (data) => console.log("Received:", data),
  onError: (error) => console.error("Error:", error),
  onClose: () => console.log("Disconnected"),
});

await client.connect();

// Same API as browser client
client.sendJson({ message: "Hello from server!" });
client.sendString("Hello TKN!");
client.sendBinary(new Uint8Array([1, 2, 3, 4]));
```

## Protocol Types

```typescript
import { TYPE_JSON, TYPE_STRING, TYPE_BINARY, TYPE_BATCH } from "@tkn/client";

// Message types for batch operations
const batchItems = [
  { type: TYPE_STRING, data: "text" },
  { type: TYPE_JSON, data: { key: "value" } },
  { type: TYPE_BINARY, data: new Uint8Array([1, 2, 3]) },
];
```

## Benefits of Focused Clients

### ✅ **Clear Intent**

- Explicitly choose the right client for your environment
- No runtime environment detection overhead
- Self-documenting binary protocol operations

### ✅ **Smaller Bundles**

- Browser builds only include WebSocket code
- Server builds only include socket code
- Better tree-shaking and optimization

### ✅ **Simpler APIs**

- No union types or optional properties
- Platform-specific optimizations
- Focused error handling

### ✅ **Better Testing**

- Each client can be tested independently
- No cross-platform compatibility issues
- Clear separation of concerns

## Examples

- **Browser**: `examples/browser-example.html` - Interactive HTML example
- **Node/Bun**: `examples/tkn-batch-example.ts` - File processing example

## Binary Protocol

The TKN protocol uses a 5-byte header format:

```
+------+----------------+------------------+
| Type | Length (4 bytes) | Payload         |
+------+----------------+------------------+
```

- **Type**: 1=JSON, 2=STRING, 3=BINARY, 4=BATCH
- **Length**: Big-endian 32-bit payload size
- **Payload**: Variable-length data

All encoding/decoding is handled automatically by the focused clients.

## License

[Add your license information here]
