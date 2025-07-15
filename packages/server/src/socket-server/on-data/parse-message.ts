import pino from "pino";
import type { SessionConfig } from "./initialize-session";

const logger = pino({ name: "parse-message" });

export interface ParsedMessage {
  type: "data" | "config";
  content: string[] | SessionConfig;
}

export function parseMessage(rawData: Uint8Array | string): ParsedMessage {
  try {
    if (rawData instanceof Uint8Array) {
      const text = new TextDecoder().decode(rawData);

      // Check if this is a configuration message (starts with CONFIG:)
      if (text.startsWith("CONFIG:")) {
        const configJson = text.substring(7); // Remove 'CONFIG:' prefix
        try {
          const config = JSON.parse(configJson) as SessionConfig;
          return { type: "config", content: config };
        } catch (err) {
          logger.error(
            { error: err, configJson },
            "Failed to parse config message"
          );
          return { type: "data", content: [] };
        }
      }

      // Regular data message
      return { type: "data", content: parseDelimitedText(text) };
    }

    if (typeof rawData === "string") {
      if (rawData.startsWith("CONFIG:")) {
        const configJson = rawData.substring(7);
        try {
          const config = JSON.parse(configJson) as SessionConfig;
          return { type: "config", content: config };
        } catch (err) {
          logger.error(
            { error: err, configJson },
            "Failed to parse config message"
          );
          return { type: "data", content: [] };
        }
      }
      return { type: "data", content: parseDelimitedText(rawData) };
    } else {
      throw new Error("Invalid data type");
    }
  } catch (err) {
    logger.error({ error: err }, "Error parsing data to batch");
    return { type: "data", content: [] };
  }
}

function parseDelimitedText(text: string): string[] {
  const lines = text.split("\n").filter((line) => line.length > 0);
  return lines;
}
