export interface CliOptions {
  host: string;
  port: number;
  chunkSize: number;
  batchSize: number;
  format: "auto" | "text" | "binary" | "json";
  verbose: boolean;
  dryRun: boolean;
}

export const DEFAULT_OPTIONS: CliOptions = {
  host: "localhost",
  port: 4001,
  chunkSize: 1024,
  batchSize: 50,
  format: "auto",
  verbose: false,
  dryRun: false,
};

export interface ProcessingStats {
  chunks: number;
  bytes: number;
}
