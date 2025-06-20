# TKN Metrics Server

A dedicated performance monitoring and metrics collection server for the TKN tokenization system.

## Features

- **Prometheus Metrics**: Exposes metrics in Prometheus format for scraping
- **Real-time Collection**: Receives performance data via socket connections
- **Session Tracking**: Monitors individual TKN sessions from start to finish
- **Histogram Analysis**: Provides detailed timing distributions for capacity analysis
- **Web Dashboard**: Simple web interface showing configuration and endpoints

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   TKN Server    │───▶│ Metrics Server  │───▶│   Prometheus    │
│                 │    │                 │    │                 │
│ Sends perf data │    │ Collects &      │    │ Scrapes metrics │
│ via socket      │    │ aggregates      │    │ for monitoring  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │     Grafana     │
                       │                 │
                       │ Visualizes data │
                       │ & dashboards    │
                       └─────────────────┘
```

## Metrics Collected

### Session Metrics

- `tkn_sessions_total{status}` - Total sessions (active, completed, failed)
- `tkn_session_duration_seconds` - Session duration histogram

### Processing Metrics

- `tkn_items_processed_total` - Total items processed
- `tkn_tokens_emitted_total` - Total tokens emitted
- `tkn_transform_duration_seconds` - Transform operation timing
- `tkn_batch_processing_duration_seconds` - Batch processing timing

### Performance Metrics

- `tkn_compression_ratio` - Compression effectiveness
- `tkn_bytes_per_token` - Token efficiency
- `tkn_batch_size` - Batch size distribution

### Database Metrics

- `tkn_db_operations_total{operation}` - Database operations by type
- `tkn_db_operation_duration_seconds` - Database operation timing

### System Metrics

- `tkn_active_sessions` - Currently active sessions
- `tkn_queue_length` - Processing queue length

## Usage

### Starting the Server

```bash
# Development
bun run dev

# Production
bun run start

# Docker
docker-compose up tkn-metrics-server
```

### Environment Variables

- `METRICS_HTTP_PORT` - HTTP server port (default: 5000)
- `METRICS_SOCKET_PORT` - Socket server port (default: 5001)
- `PROMETHEUS_PREFIX` - Metrics prefix (default: tkn\_)
- `NODE_ENV` - Environment (development/production)

### Endpoints

- `http://localhost:5000/` - Web dashboard
- `http://localhost:5000/metrics` - Prometheus metrics
- `http://localhost:5000/health` - Health check
- `tcp://localhost:5001` - Performance data socket

### Sending Performance Data

```typescript
import { getMetricsClient } from "tkn-metrics-server/client";

const metrics = getMetricsClient();

// Session lifecycle
metrics.sessionStart("session-123", { inputSize: 1000 });
metrics.batchProcessed("session-123", {
  batchSize: 50,
  processingDuration: 25.5,
  queueLength: 3,
});
metrics.transformCompleted("session-123", {
  duration: 12.3,
  tokensEmitted: 25,
});
metrics.sessionEnd("session-123", {
  totalItems: 1000,
  totalTokens: 500,
  compressionRatio: 0.5,
  bytesPerToken: 24.7,
});
```

## Integration with TKN Server

The TKN server automatically connects to the metrics server when `METRICS_ENABLED` is not set to `false`.

Configure the connection:

```bash
export METRICS_SERVER_HOST=localhost
export METRICS_SERVER_PORT=5001
```

## Prometheus Configuration

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: "tkn-metrics"
    static_configs:
      - targets: ["localhost:5000"]
    scrape_interval: 15s
    metrics_path: /metrics
```

## Grafana Dashboard

The metrics are designed to work with Grafana dashboards. Key queries:

```promql
# Processing rate
rate(tkn_items_processed_total[5m])

# Transform capacity (P95)
histogram_quantile(0.95, rate(tkn_transform_duration_seconds_bucket[5m]))

# Session success rate
rate(tkn_sessions_total{status="completed"}[5m]) / rate(tkn_sessions_total[5m])

# Compression effectiveness
histogram_quantile(0.5, tkn_compression_ratio_bucket)
```

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Build
bun run build

# Test
bun test
```

## Docker

```bash
# Build image
docker build -t tkn-metrics-server .

# Run container
docker run -p 5000:5000 -p 5001:5001 tkn-metrics-server
```
