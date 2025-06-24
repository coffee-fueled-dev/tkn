import { logger } from "src";

export const readFile = async (filePath: string) => {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    logger.error({ filePath }, "Corpus file not found");
    process.exit(1);
  }

  logger.info({ fileSize: file.size }, "Processing corpus file");

  return { stream: file.stream() };
};
