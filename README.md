# TKN Protocol

This repository contains the TKN (Token) server and client implementation, which uses a lightweight binary protocol for efficient communication.

## Protocol Overview

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

### Running the Server

```bash
bun run server/src/index.ts
```

## TKN Client Library

A lightweight client library is included for easy communication with the TKN server:

- `lib/tkn-client.ts`: Node.js/Bun client library
- `lib/tkn-browser-client.ts`: Browser-compatible client using WebSockets

### Using the Node.js Client

```typescript
import { TknClient } from "./lib/tkn-client";

// Create a client
const client = new TknClient({
  host: "localhost",
  port: 8080,
  onConnect: (client) => {
    console.log("Connected to TKN server!");

    // Send JSON data
    client.sendJson({ type: "sensor", values: [42, 17, 23, 84] }, true);

    // Send string data
    client.sendString("Hello from TKN client!", true);

    // Send binary data
    client.sendBinary(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), true);

    // Send batch data (combining multiple message types)
    client.sendBatch(
      [
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
      ],
      true
    );
  },
});

// Connect to the server
client.connect();
```

### Using the Browser Client

```html
<script type="module">
  import { TknBrowserClient } from "./lib/tkn-browser-client.js";

  const client = new TknBrowserClient({
    url: "ws://localhost:8080",
    onConnect: (client) => {
      console.log("Connected to TKN server!");

      // Send JSON data
      client.sendJson({ type: "sensor", values: [42, 17, 23, 84] }, true);

      // Send a batch of mixed data
      client.sendBatch(
        [
          { type: 1, data: { event: "login", user: "user123" } },
          { type: 2, data: "System initialized" },
        ],
        true
      );
    },
  });

  client.connect();
</script>
```

### Client API

Both client libraries share a similar API:

- `connect()`: Connect to the TKN server
- `disconnect()`: Close the connection
- `sendJson(data, pad)`: Send JSON data
- `sendString(data, pad)`: Send string data
- `sendBinary(data, pad)`: Send binary data
- `sendBatch(items, pad)`: Send multiple items of different types in a single message
- `isConnected()`: Check connection status

The `pad` parameter (boolean) adds padding to ensure data meets minimum size requirements.

## Example Client

An example client is provided in `client-example.ts`. It demonstrates how to connect to the server and send different types of data using the protocol.

### Running the Client

```bash
bun run client-example.ts
```

More comprehensive examples are available in:

- `examples/tkn-client-demo.ts`: Node.js client example
- `examples/browser-example.html`: Browser client example

### Running the Examples

```bash
bun run examples/tkn-client-demo.ts
```

For the browser example, serve the HTML file and access it in your browser.

## Usage Examples

### Sending JSON Data

```typescript
// JSON object
const jsonData = {
  type: "sensor",
  values: [42, 17, 23, 84],
  timestamp: Date.now(),
};
socket.write(encodeMessage(TYPE_JSON, jsonData));
```

### Sending String Data

```typescript
// String data
socket.write(encodeMessage(TYPE_STRING, "Hello from TKN client!"));
```

### Sending Binary Data

```typescript
// Binary data
const binaryData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
socket.write(encodeMessage(TYPE_BINARY, binaryData));
```

### Sending Batch Data

```typescript
// Batch data (multiple items of different types)
const batchItems = [
  { type: TYPE_JSON, data: { event: "measurement", value: 42 } },
  { type: TYPE_STRING, data: "System log entry" },
  { type: TYPE_BINARY, data: new Uint8Array([0, 1, 2, 3, 4]) },
];
socket.write(encodeMessage(TYPE_BATCH, batchItems));
```

## Message Encoding Function

```typescript
/**
 * Encode a message according to the protocol
 */
function encodeMessage(
  type: number,
  data: string | Uint8Array | object | Array<{ type: number; data: any }>
): Uint8Array {
  // Convert data to binary format if needed
  let binaryData: Uint8Array;

  if (type === TYPE_BATCH) {
    // Special handling for batch type
    return encodeBatchMessage(data as Array<{ type: number; data: any }>);
  } else if (type === TYPE_JSON) {
    const jsonStr = typeof data === "string" ? data : JSON.stringify(data);
    binaryData = new TextEncoder().encode(jsonStr);
  } else if (type === TYPE_STRING) {
    binaryData = new TextEncoder().encode(data as string);
  } else if (type === TYPE_BINARY) {
    binaryData = data as Uint8Array;
  } else {
    throw new Error(`Invalid message type: ${type}`);
  }

  // Create the message buffer with header + data
  const messageBuffer = new Uint8Array(
    PROTOCOL_HEADER_SIZE + binaryData.length
  );

  // Set message type (first byte)
  messageBuffer[0] = type;

  // Set message length (next 4 bytes, big-endian)
  const length = binaryData.length;
  messageBuffer[1] = (length >> 24) & 0xff;
  messageBuffer[2] = (length >> 16) & 0xff;
  messageBuffer[3] = (length >> 8) & 0xff;
  messageBuffer[4] = length & 0xff;

  // Copy the data
  messageBuffer.set(binaryData, PROTOCOL_HEADER_SIZE);

  return messageBuffer;
}
```
