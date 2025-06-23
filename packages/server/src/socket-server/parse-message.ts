import pino from "pino";

const logger = pino({ name: "parse-message" });

export function parseMessage(rawData: Uint8Array<ArrayBufferLike>): string[] {
  try {
    if (rawData instanceof Uint8Array) {
      const text = new TextDecoder().decode(rawData);
      return parseDelimitedText(text);
    }

    if (typeof rawData === "string") {
      return parseDelimitedText(rawData);
    } else throw new Error("Invalid data type");
  } catch (err) {
    logger.error({ error: err }, "Error parsing data to batch");
    return [];
  }
}

function parseDelimitedText(text: string): string[] {
  const lines = text.split("\n").filter((line) => line.length > 0);
  return lines;
}
