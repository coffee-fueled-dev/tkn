#!/usr/bin/env bun

/**
 * Brown Corpus Preparation Script (Bun/TS)
 *
 * Creates two files in .corpus/:
 * 1) brown_unsegmented.txt  (concatenated, no spaces)
 * 2) brown_gold_standard.txt (space-separated words)
 *
 * Usage:
 *   bun run brown.ts
 *   bun run brown.ts --max-words 100000
 *   bun run brown.ts --brown-dir /path/to/nltk_data/corpora/brown
 *   BROWN_ZIP_URL=https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/brown.zip bun run brown.ts
 */

import { join } from "node:path";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import JSZip from "jszip";

type Args = {
  maxWords?: number | null;
  brownDir?: string | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let maxWords: number | null = null;
  let brownDir: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--max-words" && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n <= 0) {
        console.error("❌ --max-words must be a positive number");
        process.exit(1);
      }
      maxWords = n;
    } else if (a === "--brown-dir" && argv[i + 1]) {
      brownDir = argv[++i];
    }
  }
  return { maxWords, brownDir };
}

const OUTPUT_DIR = ".corpus";
const OUTPUT_UNSEGMENTED_FILE = join(OUTPUT_DIR, "brown_unsegmented.txt");
const OUTPUT_GOLD_STANDARD_FILE = join(OUTPUT_DIR, "brown_gold_standard.txt");
const DEFAULT_BROWN_ZIP_URL =
  process.env.BROWN_ZIP_URL ??
  "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/brown.zip";

async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function findLocalBrownDir(
  cliDir?: string | null
): Promise<string | null> {
  const candidates = [
    cliDir,
    "./nltk_data/corpora/brown",
    "./corpora/brown",
    join(process.env.HOME || "", "nltk_data/corpora/brown"),
    join(process.cwd(), "brown"),
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (await exists(c)) return c;
  }
  return null;
}

async function downloadAndUnzipBrown(cacheRoot = ".cache"): Promise<string> {
  await mkdir(cacheRoot, { recursive: true });
  const zipPath = join(cacheRoot, "brown.zip");
  const outDir = join(cacheRoot, "brown");

  if (!(await exists(zipPath))) {
    console.log("📥 Downloading Brown corpus zip...");
    const res = await fetch(DEFAULT_BROWN_ZIP_URL);
    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await Bun.write(zipPath, buf);
  } else {
    console.log("✅ Using cached brown.zip");
  }

  if (!(await exists(outDir))) {
    console.log("🗜️  Unzipping...");
    const zipData = await readFile(zipPath);
    const zip = await JSZip.loadAsync(zipData);
    await mkdir(outDir, { recursive: true });

    // Extract everything into cache/brown/
    const entries = Object.keys(zip.files);
    for (const name of entries) {
      const f = zip.files[name];
      if (!f) continue;
      if (f.dir) {
        await mkdir(join(outDir, name), { recursive: true });
      } else {
        const content = await f.async("nodebuffer");
        const outPath = join(outDir, name);
        await mkdir(join(outPath, ".."), { recursive: true });
        await Bun.write(outPath, content);
      }
    }
  } else {
    console.log("✅ Using cached unzipped Brown corpus");
  }

  // The zip contains a top-level "brown/" directory
  const brownDir = join(outDir, "brown");
  if (!(await exists(brownDir))) {
    throw new Error("Unzipped corpus missing 'brown/' directory");
  }
  return brownDir;
}

export function stripPosTag(token: string): string | null {
  const slash = token.lastIndexOf("/");
  const word = slash === -1 ? token : token.slice(0, slash);
  if (!word) return null;

  // Brown quoting tokens
  if (word === "``") return "“";
  if (word === "''") return "”";

  // Common dash token in Brown
  if (word === "--") return "—";

  return word;
}

export function detokenize(tokens: Iterable<string>): string {
  const noSpaceBefore = new Set([
    ",",
    ".",
    ":",
    ";",
    "?",
    "!",
    "%",
    ")",
    "]",
    "}",
    "”",
    "’",
  ]);
  const noSpaceAfter = new Set(["(", "[", "{", "“", "$", "£", "€"]);
  const attachAsClitic = (t: string) =>
    /^('s|'re|'ve|'d|n't|'ll|'m|'em)$/.test(t);

  let out = "";
  let prev = "";

  for (const raw of tokens) {
    const t = raw;

    // 1) Skip duplicate sentence-final punctuation (e.g., "Jr." then ".")
    if ((t === "." || t === "?" || t === "!") && prev.endsWith(t)) {
      continue;
    }

    // 2) Em dash spacing: ensure spaces around — while avoiding doubles
    if (t === "—") {
      // Normalize to " — " unless at boundaries
      if (!out) {
        out = "—";
        prev = t;
        continue;
      }
      if (out[out.length - 1] !== " ") out += " ";
      out += "—";
      prev = t;
      continue;
    }

    if (!out) {
      out = t;
    } else if (noSpaceBefore.has(t) || attachAsClitic(t)) {
      out += t;
    } else if (noSpaceAfter.has(prev)) {
      out += t;
    } else {
      out += " " + t;
    }
    prev = t;
  }

  // --- Post-pass cleanup ---
  // Remove space before closers / punctuation
  out = out.replace(/\s+([,.;:?!%)\]\}”’])/g, "$1");
  // Remove space after openers
  out = out.replace(/([(\[\{“$£€])\s+/g, "$1");
  // Normalize em dash spacing to single spaces on both sides
  out = out.replace(/\s*—\s*/g, " — ");
  // Collapse multiple spaces
  out = out.replace(/\s{2,}/g, " ");
  // Trim
  out = out.trim();

  return out;
}

async function* iterBrownTokens(brownDir: string): AsyncGenerator<string> {
  const files = (await readdir(brownDir)).filter((f) =>
    /^[a-z]{2}\d{2}$/i.test(f)
  );
  files.sort();
  for (const file of files) {
    const txt = await readFile(join(brownDir, file), "utf8");
    for (const tok of txt.split(/\s+/)) {
      if (!tok) continue;
      const cleaned = stripPosTag(tok);
      if (cleaned) yield cleaned;
    }
  }
}

async function main() {
  const { maxWords, brownDir: cliBrownDir } = parseArgs();

  console.log("\n🤖 Brown Corpus Preparation Script (Bun)");
  console.log("=".repeat(50));

  // Find or fetch the corpus
  let brownDir = await findLocalBrownDir(cliBrownDir);
  if (brownDir) {
    console.log(`📚 Using local Brown corpus at: ${brownDir}`);
  } else {
    console.log("🔎 Local Brown corpus not found; will download.");
    brownDir = await downloadAndUnzipBrown(".cache");
    console.log(`📚 Brown corpus ready at: ${brownDir}`);
  }

  const allGoldWords: string[] = [];
  let wordCount = 0;

  console.log(
    "\n🔄 Processing: removing POS tags while preserving casing and punctuation..."
  );
  for await (const w of iterBrownTokens(brownDir)) {
    allGoldWords.push(w);
    wordCount++;
    if (maxWords && wordCount >= maxWords) {
      console.log(`🛑 Reached word limit of ${maxWords.toLocaleString()}`);
      break;
    }
  }

  console.log(
    `✅ Processed ${allGoldWords.length.toLocaleString()} total words.`
  );

  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Output directory: ${join(process.cwd(), OUTPUT_DIR)}`);

  // Gold (space-separated)
  console.log(`📝 Writing gold standard file to: ${OUTPUT_GOLD_STANDARD_FILE}`);
  await writeFile(OUTPUT_GOLD_STANDARD_FILE, allGoldWords.join(" "), "utf8");
  const goldSize = (await stat(OUTPUT_GOLD_STANDARD_FILE)).size;
  console.log(
    `✅ Gold standard file created (${goldSize.toLocaleString()} bytes)`
  );

  // Unsegmented (no spaces)
  console.log(
    `📝 Writing unsegmented input file to: ${OUTPUT_UNSEGMENTED_FILE}`
  );
  await writeFile(OUTPUT_UNSEGMENTED_FILE, allGoldWords.join(""), "utf8");
  const unsegSize = (await stat(OUTPUT_UNSEGMENTED_FILE)).size;
  console.log(
    `✅ Unsegmented file created (${unsegSize.toLocaleString()} bytes)`
  );

  // Sanity check
  console.log("\n🔍 Sanity Check");
  console.log("-".repeat(20));
  const goldPreview = (await readFile(OUTPUT_GOLD_STANDARD_FILE, "utf8")).slice(
    0,
    100
  );
  console.log(`Gold Standard start: '${goldPreview}...'`);
  const unsegPreview = (await readFile(OUTPUT_UNSEGMENTED_FILE, "utf8")).slice(
    0,
    100
  );
  console.log(`Unsegmented start:   '${unsegPreview}...'`);

  // Stats
  const totalChars = allGoldWords.reduce((acc, w) => acc + w.length, 0);
  const avgWordLen = allGoldWords.length ? totalChars / allGoldWords.length : 0;
  const uniqueWords = new Set(allGoldWords).size;

  console.log(`\n📊 Corpus Statistics`);
  console.log("-".repeat(20));
  console.log(`Total words: ${allGoldWords.length.toLocaleString()}`);
  console.log(`Total characters: ${totalChars.toLocaleString()}`);
  console.log(`Average word length: ${avgWordLen.toFixed(2)} characters`);
  console.log(`Unique words: ${uniqueWords.toLocaleString()}`);

  console.log("\n✅ Corpus preparation complete!");
  console.log("\n💡 Next steps:");
  console.log(
    `   1. Use '${OUTPUT_UNSEGMENTED_FILE}' as input to your TKN CLI`
  );
  console.log(
    `   2. Use '${OUTPUT_GOLD_STANDARD_FILE}' as ground truth for evaluation`
  );
  console.log(`   3. Example CLI command:`);
  console.log(`      bun run cli:brown -- ${OUTPUT_UNSEGMENTED_FILE}`);
  console.log(`   4. Example BPE command:`);
  console.log(`      bun run corpus:bpe ${OUTPUT_GOLD_STANDARD_FILE}\n`);
}

main().catch((e) => {
  console.error(`\n❌ Error: ${e?.message ?? e}`);
  process.exit(1);
});
