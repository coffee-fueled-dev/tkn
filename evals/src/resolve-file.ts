import type { BunFile } from "bun";
import path from "node:path";
import { existsSync } from "node:fs";

/**
 * Resolves a file in the .corpus directory by searching upward from the current location
 * until it finds the tools/corpora/.corpus directory structure.
 *
 * This ensures the resolver works regardless of where it's called from in the project.
 */
export const resolveFile = (fileName: string): BunFile => {
  const corpusPath = findCorpusDirectory();
  if (!corpusPath) {
    throw new Error(
      `Could not find .corpus directory. Searched from: ${import.meta.dir}`
    );
  }

  const filePath = path.join(corpusPath, fileName);
  return Bun.file(filePath);
};

/**
 * Searches upward from the current directory to find tools/corpora/.corpus
 */
function findCorpusDirectory(): string | null {
  let currentDir = import.meta.dir;

  // Search up to 10 levels to avoid infinite loops
  for (let i = 0; i < 10; i++) {
    const candidatePath = path.join(currentDir, "tools", "corpora", ".corpus");

    if (existsSync(candidatePath)) {
      return candidatePath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root
      break;
    }
    currentDir = parentDir;
  }

  return null;
}
