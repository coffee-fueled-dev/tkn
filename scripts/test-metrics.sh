#!/bin/bash

# Test script to verify metrics endpoint is working

METRICS_URL="http://localhost:3001/metrics"

echo "Testing TKN Server metrics endpoint..."
echo "URL: $METRICS_URL"
echo "=================================="

# Test if the endpoint is reachable
if curl -f -s "$METRICS_URL" > /dev/null; then
    echo "✅ Metrics endpoint is reachable"
    echo ""
    echo "Available metrics:"
    echo "=================="
    curl -s "$METRICS_URL" | grep -E "^# HELP|^component_" | head -20
    echo ""
    echo "Metric counts:"
    echo "=============="
    echo "Total metrics: $(curl -s "$METRICS_URL" | grep -c "^component_")"
    echo "Throughput metrics: $(curl -s "$METRICS_URL" | grep -c "component_operation_throughput_total")"
    echo "Latency metrics: $(curl -s "$METRICS_URL" | grep -c "component_operation_latency_seconds")"
    echo "Error metrics: $(curl -s "$METRICS_URL" | grep -c "component_operation_errors_total")"
    echo "Dependency metrics: $(curl -s "$METRICS_URL" | grep -c "component_dependency_calls_total")"
else
    echo "❌ Metrics endpoint is not reachable"
    echo "Make sure your TKN server is running with METRICS_PORT=3001"
    exit 1
fi