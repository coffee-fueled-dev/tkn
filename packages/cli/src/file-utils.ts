import type { CliOptions } from "./types.js";

export function detectFileFormat(
  filePath: string,
  options: CliOptions
): "text" | "binary" | "json" {
  if (options.format !== "auto") {
    return options.format as "text" | "binary" | "json";
  }

  const ext = filePath.toLowerCase().split(".").pop() || "";

  if (["json", "jsonl"].includes(ext)) {
    return "json";
  }

  if (
    [
      "txt",
      "log",
      "md",
      "csv",
      "tsv",
      "yaml",
      "yml",
      "xml",
      "html",
      "css",
      "js",
      "ts",
    ].includes(ext)
  ) {
    return "text";
  }

  return "binary";
}

export async function* streamFileInChunks(
  filePath: string,
  chunkSize: number
): AsyncGenerator<Uint8Array> {
  const file = Bun.file(filePath);
  const stream = file.stream();
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Split large chunks if needed
      if (value.length <= chunkSize) {
        yield value;
      } else {
        for (let i = 0; i < value.length; i += chunkSize) {
          yield value.slice(i, i + chunkSize);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream text files character by character for TKN processing
 * This is the correct granularity for token mining
 */
export async function* streamTextFileByCharacter(
  filePath: string
): AsyncGenerator<string> {
  const text = await Bun.file(filePath).text();

  for (let i = 0; i < text.length; i++) {
    yield text[i];
  }
}

/**
 * Stream JSON files by individual JSON objects/values
 * For JSONL files, each line is a separate JSON object
 */
export async function* streamJsonFile(filePath: string): AsyncGenerator<any> {
  const text = await Bun.file(filePath).text();

  if (filePath.toLowerCase().endsWith(".jsonl")) {
    // JSONL format - each line is a separate JSON object
    const lines = text.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      try {
        yield JSON.parse(line);
      } catch (err) {
        console.warn(
          `Warning: Failed to parse JSON line: ${line.substring(0, 50)}...`
        );
      }
    }
  } else {
    // Regular JSON - try to parse as single object first
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        // If it's an array, yield each element
        for (const item of parsed) {
          yield item;
        }
      } else {
        // Single object
        yield parsed;
      }
    } catch (err) {
      console.warn(`Warning: Failed to parse JSON file: ${filePath}`);
    }
  }
}
