import { TknNodeClient, type TknMessageType, type TknData } from "tkn-client";
import type { CliOptions } from "./types.js";

export async function connectToServer(
  options: CliOptions
): Promise<TknNodeClient> {
  return new Promise((resolve, reject) => {
    const client = new TknNodeClient({
      host: options.host,
      port: options.port,
      autoReconnect: false, // Disable auto-reconnect for CLI usage
      onConnect: () => {
        if (options.verbose) {
          console.log(
            `✅ Connected to TKN server at ${options.host}:${options.port}`
          );
        }
        resolve(client);
      },
      onError: (error) => {
        console.error(`❌ Connection error:`, error);
        reject(error);
      },
      onClose: () => {
        if (options.verbose) {
          console.log("🔒 Connection closed");
        }
      },
      onData: (data) => {
        if (options.verbose) {
          const response = new TextDecoder().decode(data);
          console.log(`← Server response: ${response}`);
        }
      },
    });

    client.connect().catch(reject);
  });
}

export async function sendBatch(
  batch: Array<{ type: TknMessageType; data: TknData }>,
  client: TknNodeClient | null,
  options: CliOptions,
  startChunk: number,
  endChunk: number
): Promise<void> {
  if (options.dryRun) {
    console.log(
      `🔍 Would send batch: chunks ${startChunk}-${endChunk} (${batch.length} items)`
    );
    return;
  }

  if (!client) {
    throw new Error("Client not connected");
  }

  const success = client.sendBatch(batch);

  if (options.verbose) {
    console.log(
      `📤 Sent batch: chunks ${startChunk}-${endChunk} (${
        batch.length
      } items) - ${success ? "✅" : "❌"}`
    );
  }

  if (!success) {
    throw new Error(`Failed to send batch: chunks ${startChunk}-${endChunk}`);
  }
}
