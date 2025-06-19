# TKN Docker Setup

This Docker Compose setup provides a complete development and production environment for the TKN project.

## Services

### 1. TKN Server (`tkn-server`)

- **Port**: 3000 (main server)
- **Metrics Port**: 3001
- Built from `packages/server/`
- Connects to Memgraph database
- Exposes Prometheus metrics

### 2. Memgraph Database (`memgraph`)

- **Bolt Port**: 7687
- **Lab UI Port**: 7444
- Username: `memgraph`
- Password: `memgraph`
- Persistent data storage

### 3. Prometheus (`prometheus`)

- **Port**: 9090
- Scrapes metrics from TKN server
- Configuration in `prometheus/prometheus.yml`

### 4. Grafana (`grafana`)

- **Port**: 3002
- Username: `admin`
- Password: `admin`
- Pre-configured with Prometheus datasource

## Quick Start

### Development

```bash
# Start all services in development mode
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View logs
docker-compose logs -f tkn-server

# Stop services
docker-compose down
```

### Production

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Service URLs

- **TKN Server HTTP/Metrics**: `http://localhost:4000` (includes /health and /metrics)
- **TKN Socket Server**: `localhost:4001` (for client data connections)
- **Memgraph Lab**: http://localhost:7444
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3002

## Environment Variables

Create a `.env` file in the root directory with:

```env
NODE_ENV=production
TKN_PORT=3000
METRICS_PORT=3001
MEMGRAPH_URI=bolt://memgraph:7687
MEMGRAPH_USER=memgraph
MEMGRAPH_PASS=memgraph
MEMGRAPH_DB_NAME=memgraph
GF_SECURITY_ADMIN_PASSWORD=admin
```

## Data Persistence

The following volumes persist data:

- `memgraph_data`: Memgraph database files
- `prometheus_data`: Prometheus metrics storage
- `grafana_data`: Grafana dashboards and settings

## Monitoring

### Prometheus Metrics

Access at http://localhost:9090

Available metrics from TKN server:

- `component_operation_throughput_total`
- `component_operation_latency_seconds`
- `component_operation_errors_total`
- `component_dependency_calls_total`

### Grafana Dashboards

Access at http://localhost:3002

- Login: admin/admin
- Pre-configured Prometheus datasource
- Create custom dashboards for TKN metrics

## Troubleshooting

### Check service health

```bash
docker-compose ps
docker-compose logs [service-name]
```

### Reset all data

```bash
docker-compose down -v
docker-compose up -d
```

### Rebuild TKN server

```bash
docker-compose build tkn-server
docker-compose up -d tkn-server
```

````

I've created a comprehensive Docker Compose setup for your TKN project that includes:

## **Services Included:**

1. **TKN Server** - Your main application server
   - Runs on port 3000 (configurable)
   - Metrics endpoint on port 3001
   - Built with Bun runtime

2. **Memgraph Database** - Graph database for your application
   - Bolt protocol on port 7687
   - Web interface on port 7444
   - Persistent data storage

3. **Prometheus** - Metrics collection and storage
   - Web UI on port 9090
   - Configured to scrape your TKN server metrics
   - Persistent metrics storage

4. **Grafana** - Metrics visualization (bonus)
   - Web UI on port 3002
   - Pre-configured with Prometheus datasource
   - Default login: admin/admin

## **Key Features:**

- **Environment-specific configs** - Separate dev/prod configurations
- **Health checks** - Automatic service health monitoring
- **Persistent storage** - Data survives container restarts
- **Proper networking** - Services can communicate securely
- **Hot reload** - Development mode with file watching

## **Usage:**

```bash
# Development (with hot reload)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Production
docker-compose up -d

# View logs
docker-compose logs -f tkn-server
````

The setup automatically handles service dependencies, so Memgraph starts before your TKN server, and Prometheus waits for the TKN server to be ready before scraping metrics.

All the configuration files are ready to use - just run the commands above and your entire stack will be up and running!
