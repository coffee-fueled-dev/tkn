import pino from "pino";

const logger = pino({ name: "read-file" });

export const readFile = async (filePath: string) => {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    logger.error({ filePath }, "Corpus file not found");
    process.exit(1);
  }

  logger.info({ fileSize: file.size }, "Processing corpus file");

  // Convert ReadableStream to async iterable
  const stream = file.stream();
  const reader = stream.getReader();

  const asyncIterable = {
    async *[Symbol.asyncIterator]() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  };

  return { stream: asyncIterable };
};
