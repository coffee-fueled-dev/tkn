export const readFile = async (filePath: string) => {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    console.error({ filePath }, "Corpus file not found");
    process.exit(1);
  }

  console.info({ fileSize: file.size }, "Processing corpus file");

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

  return { stream: asyncIterable, size: file.size };
};
