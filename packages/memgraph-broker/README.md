# TKN Memgraph Broker

A high-throughput broker service that handles token persistence to Memgraph using Redis pub/sub. This service decouples the real-time tokenization pipeline from database write operations.

## Architecture

- **Redis Pub/Sub**: Receives tokens from the main TKN server via publish/subscribe
- **Batching**: Groups tokens by value to optimize database operations
- **Memgraph**: Persists tokens and their session relationships

## Features

- **High Throughput**: Redis pub/sub can handle millions of messages per second
- **Fire-and-forget**: Main server publishes tokens without blocking
- **Batch optimization**: Groups identical tokens to reduce database locks
- **Real-time processing**: No polling, immediate processing of published tokens
- **Health monitoring**: HTTP endpoints for health checks and metrics

## Environment Variables

```bash
REDIS_URI=redis://localhost:6379
MEMGRAPH_URI=bolt://localhost:7687
MEMGRAPH_USER=memgraph
MEMGRAPH_PASS=memgraph
PORT=4002
BATCH_SIZE=100
BATCH_TIMEOUT_MS=5000
```

## Usage

### Development

```bash
bun dev
```

### Production

```bash
bun start
```

### Docker

```bash
docker-compose up memgraph-broker
```

## API Endpoints

- `GET /health` - Health check
- `GET /metrics` - Batch count, observations, and subscriber info

## Token Format

Tokens published to the broker should match this interface:

```typescript
interface Token {
  value: string; // Token content
  sessionIndex: number; // Order within session
  sessionId: string; // Session identifier
  tenantId: string; // Tenant identifier
  timestamp: number; // Observation timestamp
  preloadUsed?: string; // Optional preload indicator
}
```

## Integration

From your main server, use the BrokerClient:

```typescript
import { BrokerClient } from "tkn-memgraph-broker/client";

const broker = new BrokerClient("redis://localhost:6379");

// Publish single token
await broker.publish(token);

// Publish batch of tokens (recommended for performance)
await broker.publishBatch(tokens);

// Check subscriber count
const subscriberCount = await broker.getSubscriberCount();
```

## Database Schema

The broker creates this graph structure in Memgraph:

```
(Token {value: "hello"})-[:OBSERVED {session_index: 1, timestamp_observed: 1234567890}]->(Session {id: "session-123"})
```

- **Token nodes**: Unique by value
- **Session nodes**: Unique by session ID
- **OBSERVED edges**: Track when and where tokens were seen

## Performance

- **Pub/Sub Throughput**: Redis can handle millions of messages/second
- **Batch Processing**: Groups tokens by value for efficient database writes
- **Pipeline Publishing**: Uses Redis pipelines for batch operations
- **Non-blocking**: Main server never waits for database operations
