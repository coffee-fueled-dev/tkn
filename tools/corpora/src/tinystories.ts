#!/usr/bin/env bun

/**
 * bun run tinystories.ts 5000 -o small_sample.txt --start-index 10000
 */
import { mkdir } from "node:fs/promises";

type Args = {
  numStories: number;
  output?: string;
  startIndex: number;
  clean: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error(
      "Usage: bun run tinystories.ts <num_stories> [-o file] [--start-index N] [--no-clean]",
    );
    process.exit(1);
  }
  let numStories = Number(argv[0]);
  if (!Number.isFinite(numStories) || numStories <= 0) {
    console.error("❌ Number of stories must be positive");
    process.exit(1);
  }
  let output: string | undefined;
  let startIndex = 0;
  let clean = true;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "-o" || a === "--output") && argv[i + 1]) {
      output = argv[++i];
    } else if (a === "--start-index" && argv[i + 1]) {
      startIndex = Number(argv[++i]) || 0;
    } else if (a === "--no-clean") {
      clean = false;
    }
  }
  return { numStories, output, startIndex, clean };
}

function estimateSize(n: number) {
  const avg = 350; // chars/story
  const bytes = n * avg;
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? `~${(bytes / 1024).toFixed(1)} KB` : `~${mb.toFixed(1)} MB`;
}

async function* iterRows(
  dataset: string,
  split = "train",
  startOffset = 0,
  batch = 100,
) {
  // /rows returns up to length=100; we’ll step the offset ourselves.
  const base = "https://datasets-server.huggingface.co/rows";
  let offset = startOffset;
  while (true) {
    const url = `${base}?dataset=${encodeURIComponent(dataset)}&config=default&split=${encodeURIComponent(
      split,
    )}&offset=${offset}&length=${batch}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from dataset API`);
    const json = await res.json();
    const rows = (json as any)?.rows as
      | Array<{ row: Record<string, unknown> }>
      | undefined;
    if (!rows || rows.length === 0) break;
    for (const r of rows) yield r.row;
    offset += rows.length;
  }
}

function cleanText(s: string) {
  const t = s.trim();
  if (!t) return "";
  return t.split(/\s+/).join(" ");
}

async function main() {
  const args = parseArgs();
  const dataset = "roneneldan/TinyStories";
  const outName = args.output ?? `tinystories_${args.numStories}.txt`;
  const outPath =
    outName.includes("/") || outName.includes("\\")
      ? outName
      : `${process.cwd()}/.corpus/${outName}`;

  // ensure .corpus/
  if (!outName.includes("/") && !outName.includes("\\")) {
    await mkdir(`${process.cwd()}/.corpus`, { recursive: true });
  }

  // overwrite prompt if exists (simple)
  try {
    const stat = await Bun.file(outPath).exists();
    if (stat) {
      const data = await prompt("⚠️  File exists. Overwrite? (y/N): ");
      if (!/^y(es)?$/i.test(data.trim())) {
        console.log("❌ Cancelled");
        process.exit(0);
      }
    }
  } catch {}

  console.log("🚀 TinyStories Downloader (Bun)");
  console.log("========================================");
  console.log(`📊 Stories to download: ${args.numStories.toLocaleString()}`);
  console.log(`📁 Output file: ${outPath}`);
  console.log(`📏 Estimated size: ${estimateSize(args.numStories)}`);
  console.log(`🧹 Text cleaning: ${args.clean ? "enabled" : "disabled"}`);
  console.log(`   Starting from index: ${args.startIndex.toLocaleString()}`);

  const file = Bun.file(outPath);
  const writer = file.writer();

  let written = 0;
  let processed = 0;

  try {
    for await (const row of iterRows(dataset, "train", args.startIndex, 100)) {
      processed++;
      const textRaw = String((row as any).text ?? "");
      const text = args.clean ? cleanText(textRaw) : textRaw;
      if (!text) continue;

      await writer.write(text + "\n\n");
      written++;

      if (written % 1000 === 0) {
        console.log(`   📝 Written ${written.toLocaleString()} stories...`);
      }
      if (written >= args.numStories) break;
    }
  } catch (e: any) {
    console.error(`❌ Error: ${e.message ?? e}`);
    await writer.end();
    process.exit(1);
  }

  await writer.end();

  const size = Bun.file(outPath).size.toLocaleString();
  console.log("✅ Download complete!");
  console.log(`   📊 Stories written: ${written.toLocaleString()}`);
  console.log(`   📊 Stories processed: ${processed.toLocaleString()}`);
  console.log(`   📁 File size: ${size} bytes`);
  console.log(`\n🎉 Successfully created ${outName}`);
}

// tiny stdin prompt helper
function prompt(q: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(q);
    const chunks: Buffer[] = [];
    const onData = (c: Buffer) => {
      chunks.push(c);
      if (c.includes(10) || c.includes(13)) {
        process.stdin.off("data", onData);
        resolve(Buffer.concat(chunks).toString("utf8"));
      }
    };
    process.stdin.on("data", onData);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
