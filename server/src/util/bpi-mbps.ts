// Convert bytes processed in a given interval to megabytes per second (MB/s)
export function bpiToMbps(bytes: number, intervalMs: number): number {
  const megabytes = bytes / 1_048_576; // 1_048_576 bytes = 1 MB
  const intervalsPerSecond = 1000 / intervalMs;
  return megabytes * intervalsPerSecond;
}
