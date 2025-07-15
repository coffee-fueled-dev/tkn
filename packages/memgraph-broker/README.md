# TKN Memgraph Broker

A high-throughput broker service that handles token persistence to Memgraph using Redis pub/sub. This service decouples the real-time tokenization pipeline from database write operations.

## Architecture

- **Redis Pub/Sub**: Receives tokens from the main TKN server via publish/subscribe
- **Binned Batching**: Distributes tokens across multiple parallel processing bins to reduce latency
- **Memgraph**: Persists tokens and their session relationships with optimized connection pooling

## Features

- **High Throughput**: Redis pub/sub can handle millions of messages per second
- **Parallel Processing**: Binned batching enables concurrent database operations
- **Fire-and-forget**: Main server publishes tokens without blocking
- **Batch optimization**: Groups tokens by session index for consistent ordering
- **Real-time processing**: No polling, immediate processing of published tokens
- **Health monitoring**: HTTP endpoints for health checks and metrics
- **Performance monitoring**: Detailed stats on bin utilization and processing metrics

## Environment Variables

```bash
REDIS_URI=redis://localhost:6379
MEMGRAPH_URI=bolt://localhost:7687
MEMGRAPH_USER=memgraph
MEMGRAPH_PASS=memgraph
PORT=4002
BATCH_SIZE=100
BATCH_TIMEOUT_MS=5000
BATCH_BINS=4  # Number of parallel processing bins (default: 4)
BATCH_MAX_RETRIES=3  # Max retries for transaction conflicts (default: 3)
BATCH_RETRY_BASE_DELAY_MS=100  # Base delay for exponential backoff (default: 100ms)
```

## Binned Batching System

The broker uses a binned batching system to enable parallel processing and reduce latency:

- **Multiple Bins**: Tokens are distributed across `BATCH_BINS` parallel processing bins
- **Hash Distribution**: Tokens are assigned to bins based on their session index using modulo distribution
- **Concurrent Processing**: Each bin processes batches independently, enabling parallel database operations
- **Order Preservation**: Tokens from the same session maintain order within their assigned bin
- **Independent Timers**: Each bin has its own timeout timer for optimal batch flushing
- **Conflict Resolution**: Automatic retry with exponential backoff for transaction conflicts

### Performance Benefits

- **Reduced Latency**: Parallel processing eliminates sequential batch processing bottlenecks
- **Better Throughput**: Multiple concurrent database connections increase overall throughput
- **Load Distribution**: Even distribution of tokens across bins prevents hotspots
- **Scalable**: Number of bins can be tuned based on workload and database capacity
- **Resilient**: Automatic retry mechanism handles temporary transaction conflicts gracefully

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
  buffer: Uint8Array; // Token content as bytes
  sessionIndex: number; // Order within session
  sessionId: string; // Session identifier
  tenantId: string; // Tenant identifier
  timestamp: number; // Observation timestamp
  preloadUsed?: string; // Optional preload indicator
}
```

## Performance Monitoring

The broker provides detailed performance statistics:

```typescript
// Get bin statistics
const binStats = broker.getBinStats();
// Returns: [{ id: 0, tokenCount: 45, isProcessing: true, hasTimer: false }, ...]

// Get comprehensive performance stats
const perfStats = broker.getPerformanceStats();
// Returns: {
//   sessionId: "session-123",
//   totalBins: 4,
//   activeBins: 2,
//   processingBins: 1,
//   totalPendingTokens: 150,
//   memgraphProcessingStats: { "session-123": 2 },
//   binDetails: [...]
// }
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
(Token {bytes: [104, 101, 108, 108, 111]})-[:OBSERVED {session_index: 1, timestamp_observed: 1234567890}]->(Session {id: "session-123"})
```

- **Token nodes**: Unique by byte array representation
- **Session nodes**: Unique by session ID
- **OBSERVED edges**: Track when and where tokens were seen with session ordering

## Performance

- **Pub/Sub Throughput**: Redis can handle millions of messages/second
- **Parallel Batch Processing**: Multiple bins process batches concurrently
- **Optimized Connection Pool**: Up to 50 concurrent Memgraph connections
- **Pipeline Publishing**: Uses Redis pipelines for batch operations
- **Non-blocking**: Main server never waits for database operations
- **Concurrent Transactions**: Parallel database writes within transactions
