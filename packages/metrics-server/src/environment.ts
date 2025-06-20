export const environment = {
  HTTP_PORT: parseInt(process.env.METRICS_HTTP_PORT || "5000"),
  SOCKET_PORT: parseInt(process.env.METRICS_SOCKET_PORT || "5001"),
  NODE_ENV: process.env.NODE_ENV || "development",
  PROMETHEUS_PREFIX: process.env.PROMETHEUS_PREFIX || "tkn_",
} as const;

export type Environment = typeof environment;
