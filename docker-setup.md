# Docker Setup for TKN Server

This Docker Compose setup provides a complete monitoring and database stack for the TKN server application.

## Services

### 1. Memgraph Database

- **Port**: 7687 (Bolt protocol)
- **Web Interface**: 7444 (Memgraph Lab)
- **Credentials**: memgraph/memgraph
- **Volumes**: Persistent data storage

### 2. TKN Server

- **Application Port**: 3000 (includes metrics at `/metrics`)
- **Health Check**: `/metrics` and `/health` endpoints
- **Environment**: Production-ready configuration

### 3. Prometheus

- **Web UI**: 9091
- **Scrapes**: TKN server metrics every 10s
- **Data Retention**: 15 days
- **Configuration**: `prometheus/prometheus.yml`

### 4. Grafana (Optional)

- **Web UI**: 3001
- **Credentials**: admin/admin
- **Datasource**: Auto-configured Prometheus
- **Dashboard**: Pre-configured TKN server metrics

## Quick Start

1. **Start all services:**

   ```bash
   docker-compose up -d
   ```

2. **View logs:**

   ```bash
   docker-compose logs -f tkn-server
   ```

3. **Stop services:**

   ```bash
   docker-compose down
   ```

4. **Remove all data (including volumes):**
   ```bash
   docker-compose down -v
   ```

## Access Points

- **TKN Server**: `localhost:3000`
- **Server Metrics**: `http://localhost:3000/metrics`
- **Server Health**: `http://localhost:3000/health`
- **Memgraph Lab**: `http://localhost:7444`
- **Prometheus**: `http://localhost:9091`
- **TKN Server HTTP/Metrics**: `http://localhost:4000` (includes /health and /metrics)
- **TKN Socket Server**: `localhost:4001` (for client data connections)
- **Grafana**: `http://localhost:3002` (admin/admin)

## Environment Variables

You can customize the setup by creating a `.env` file in the root directory:

```env
# TKN Server Configuration
TKN_PORT=3000
NODE_ENV=production

# Memgraph Configuration
MEMGRAPH_URI=bolt://memgraph:7687
MEMGRAPH_USER=memgraph
MEMGRAPH_PASS=memgraph
MEMGRAPH_DB_NAME=memgraph
```

## Development Mode

For development with hot reload:

```bash
# Start only database and monitoring
docker-compose up -d memgraph prometheus grafana

# Run server locally
cd packages/server
bun run dev
```

## Monitoring

### Prometheus Metrics

The TKN server exposes the following metrics:

- `component_operation_throughput_total`: Operation counts by component
- `component_operation_latency_seconds`: Operation latency histograms
- `component_operation_errors_total`: Error counts
- `component_dependency_calls_total`: Dependency interaction counts

### Grafana Dashboard

Pre-configured dashboard includes:

- Operation throughput (ops/sec)
- Latency percentiles (50th, 95th)
- Error rates
- Dependency call rates

## Troubleshooting

### Health Checks

```bash
# Check all service health
docker-compose ps

# Check specific service logs
docker-compose logs memgraph
docker-compose logs tkn-server
docker-compose logs prometheus
```

### Common Issues

1. **Port conflicts**: Modify ports in `docker-compose.yml` if needed
2. **Memory issues**: Ensure Docker has sufficient memory allocated
3. **Permission issues**: Check volume permissions for data persistence

### Manual Health Checks

```bash
# TKN Server metrics
curl http://localhost:3000/metrics

# TKN Server health
curl http://localhost:3000/health

# Memgraph connection
curl http://localhost:7444/

# Prometheus targets
curl http://localhost:9091/api/v1/targets
```

## Scaling

For production scaling, consider:

- Adding multiple TKN server instances behind a load balancer
- Using external Memgraph cluster
- Implementing Prometheus federation for multiple instances
- Adding alerting with Alertmanager

## Data Persistence

All data is persisted in Docker volumes:

- `memgraph_data`: Database data
- `prometheus_data`: Metrics data
- `grafana_data`: Dashboard configurations

Backup these volumes for production deployments.
