#!/usr/bin/env bun

/**
 * Multilingual Corpus Preparation Script (small-slice edition)
 *
 * Goal: fetch a few KB of everyday text per language.
 * Strategy:
 *   1) Try LinguaTools Wikipedia monolingual TXT (plain text, easy to fetch)
 *   2) Fall back to Gutenberg
 *   3) Fall back to sampleText
 *
 * Usage:
 *   bun run multilingual.ts
 *   bun run multilingual.ts --language german
 *   bun run multilingual.ts --max-chars 8000
 */

import { join } from "node:path";
import { mkdir, writeFile, stat } from "node:fs/promises";

const OUTPUT_DIR = ".corpus";

type Language = {
  code: string;
  name: string;
  sources: string[]; // ordered by preference
  sampleText?: string;
};

type Args = {
  language?: string;
  maxChars?: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {};

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];

    switch (flag) {
      case "--language":
        args.language = value;
        break;
      case "--max-chars":
        args.maxChars = parseInt(value);
        break;
    }
  }

  return args;
}

/**
 * Prefer small plain-text Wikipedia extracts (LinguaTools).
 * If those ever fail, we fall back to your original Gutenberg links.
 */
const LANGUAGES: Language[] = [
  {
    code: "en",
    name: "English",
    sources: [
      "https://www.gutenberg.org/ebooks/1342.txt.utf-8", // Pride and Prejudice (Austen)
    ],
    sampleText: "",
  },
  {
    code: "de",
    name: "German",
    sources: [
      "https://www.gutenberg.org/ebooks/22367.txt.utf-8", // Die Verwandlung (Kafka)
    ],
    sampleText:
      "Das ist ein kurzer Beispielsatz auf Deutsch, der als Fallback dient.",
  },
  {
    code: "fi",
    name: "Finnish",
    sources: [
      "https://www.gutenberg.org/ebooks/56272.txt.utf-8", // Patty ja Priscilla (Finnish translation)
    ],
    sampleText:
      "Tämä on lyhyt esimerkkiteksti suomeksi, jota käytetään varmuuskopiona.",
  },
  {
    code: "zh",
    name: "Chinese",
    sources: [
      "https://www.gutenberg.org/ebooks/23825.txt.utf-8", // 施公案
    ],
    sampleText: "这是一个中文示例文本，用作后备内容。",
  },
  {
    code: "ar",
    name: "Arabic",
    sources: [
      "https://www.gutenberg.org/ebooks/43007.txt.utf-8", // Tribute to Michael Hart (Arabic)
    ],
    sampleText: "هذا نص عربي قصير يُستخدم كخيار احتياطي.",
  },
  {
    code: "tr",
    name: "Turkish",
    sources: [
      "https://www.dropbox.com/s/uyncgv2dkxg54bjafa2ig/trwiki-20181001-corpus.xml.bz2?dl=1", // Turkish Wikipedia corpus (XML)
      "https://tr.wikipedia.org/wiki/T%C3%BCrkiye", // Turkish Wikipedia page (HTML)
    ],
    sampleText: "Bu, yedek olarak kullanılan kısa bir Türkçe örnek metindir.",
  },
  {
    code: "ja",
    name: "Japanese",
    sources: [
      "https://www.gutenberg.org/ebooks/1982.txt.utf-8", // 羅生門 (Akutagawa)
    ],
    sampleText: "これは予備として使用される短い日本語のサンプルテキストです。",
  },
];

async function downloadText(url: string): Promise<string | null> {
  try {
    console.log(`📥 Downloading from ${url}...`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    console.log(`✅ Downloaded ${text.length} characters`);
    return text;
  } catch (err) {
    console.warn(`⚠️ Download failed (${url}): ${err}`);
    return null;
  }
}

/**
 * Clean and truncate text to ~maxChars.
 * For CJK & Arabic, consider local sentence punctuation.
 */
function cleanText(text: string, maxChars: number, langCode: string): string {
  // Remove common Gutenberg wrappers if present
  let cleaned = text
    .replace(/\*\*\* START OF .*? \*\*\*/s, "")
    .replace(/\*\*\* END OF .*? \*\*\*/s, "")
    .replace(/^.*?Project Gutenberg.*?$/gim, "")
    .replace(/^.*?gutenberg\.org.*?$/gim, "")
    .trim();

  if (cleaned.length <= maxChars) return cleaned;

  // Try to end at sensible sentence boundary
  let end = maxChars;

  if (langCode === "zh" || langCode === "ja") {
    const cut = Math.max(
      cleaned.lastIndexOf("。", maxChars),
      cleaned.lastIndexOf("！", maxChars),
      cleaned.lastIndexOf("？", maxChars)
    );
    if (cut > maxChars * 0.8) end = cut + 1;
  } else if (langCode === "ar") {
    const cut = Math.max(
      cleaned.lastIndexOf(".", maxChars),
      cleaned.lastIndexOf("!", maxChars),
      cleaned.lastIndexOf("?", maxChars),
      cleaned.lastIndexOf("؟", maxChars)
    );
    if (cut > maxChars * 0.8) end = cut + 1;
  } else {
    const cut = Math.max(
      cleaned.lastIndexOf(".", maxChars),
      cleaned.lastIndexOf("!", maxChars),
      cleaned.lastIndexOf("?", maxChars)
    );
    if (cut > maxChars * 0.8) end = cut + 1;
  }

  return cleaned.slice(0, end).trim();
}

async function processLanguage(
  lang: Language,
  maxChars = 100_000 // default ~5KB
): Promise<void> {
  console.log(`\n🌍 Processing ${lang.name} (${lang.code})...`);

  let text: string | null = null;

  // Try preferred sources in order
  for (const url of lang.sources) {
    text = await downloadText(url);
    if (text && text.trim()) {
      console.log(`📦 Using source: ${url}`);
      break;
    }
  }

  if (!text || !text.trim()) {
    if (lang.sampleText) {
      console.log("📝 Using fallback sampleText");
      text = lang.sampleText;
    } else {
      console.error(`❌ No text available for ${lang.name}`);
      return;
    }
  }

  const cleaned = cleanText(text, maxChars, lang.code);
  console.log(
    `✨ Cleaned text: ${cleaned.length} characters (target: ${maxChars})`
  );

  // Write to file
  const filename = `${lang.code}_sample.txt`;
  const filepath = join(OUTPUT_DIR, filename);

  await writeFile(filepath, cleaned, "utf8");
  const fileSize = (await stat(filepath)).size;

  console.log(`✅ Created ${filename} (${fileSize} bytes)`);

  // Preview
  const preview =
    cleaned.substring(0, 100) + (cleaned.length > 100 ? "..." : "");
  console.log(`📖 Preview: ${preview}`);
}

async function main() {
  const { language, maxChars } = parseArgs();

  console.log("🌐 Multilingual Corpus Preparation (small slices)");
  console.log("=".repeat(40));

  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Output directory: ${join(process.cwd(), OUTPUT_DIR)}`);

  if (language) {
    const lang = LANGUAGES.find(
      (l) =>
        l.code === language || l.name.toLowerCase() === language.toLowerCase()
    );
    if (!lang) {
      console.error(`❌ Language "${language}" not found`);
      console.log(
        "Available languages:",
        LANGUAGES.map((l) => `${l.code} (${l.name})`).join(", ")
      );
      process.exit(1);
    }
    await processLanguage(lang, maxChars ?? 5_000);
  } else {
    for (const lang of LANGUAGES) {
      await processLanguage(lang, maxChars ?? 5_000);
    }
  }

  console.log(
    "\n🎉 Done! Tiny corpora ready for language-agnostic tokenization tests."
  );
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
