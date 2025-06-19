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
