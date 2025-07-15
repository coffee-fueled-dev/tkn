#!/usr/bin/env bun

import { readdir, stat, readFile, writeFile, mkdir } from "fs/promises";
import { join, relative, resolve, basename } from "path";
import { existsSync } from "fs";
import parse from "parse-gitignore";
import { minimatch } from "minimatch";

interface GitignorePatterns {
  patterns: string[];
}

interface CollectOptions {
  targetDir?: string;
  outputDir?: string;
  includeHidden?: boolean;
  verbose?: boolean;
}

class GitignoreFilter {
  private patterns: string[] = [];
  private negativePatterns: string[] = [];

  constructor(gitignoreContent: string) {
    const parsed = parse(gitignoreContent) as unknown as GitignorePatterns;

    // Process patterns to handle gitignore semantics
    for (const pattern of parsed.patterns) {
      if (pattern.startsWith("!")) {
        this.negativePatterns.push(this.normalizePattern(pattern.slice(1))); // Remove the !
      } else {
        this.patterns.push(this.normalizePattern(pattern));
      }
    }
  }

  private normalizePattern(pattern: string): string {
    // Handle gitignore pattern semantics
    let normalized = pattern;

    // If pattern doesn't start with / and doesn't contain /, it should match at any level
    if (!normalized.startsWith("/") && !normalized.includes("/")) {
      normalized = "**/" + normalized;
    }

    // If pattern ends with /, it matches directories
    if (normalized.endsWith("/")) {
      normalized = normalized + "**";
    }

    // Remove leading slash (we're working with relative paths)
    if (normalized.startsWith("/")) {
      normalized = normalized.slice(1);
    }

    return normalized;
  }

  shouldIgnore(filePath: string): boolean {
    // Normalize path separators for cross-platform compatibility
    const normalizedPath = filePath.replace(/\\/g, "/");

    // Check if file matches any ignore pattern
    let shouldIgnore = false;
    for (const pattern of this.patterns) {
      if (minimatch(normalizedPath, pattern, { dot: true })) {
        shouldIgnore = true;
        break;
      }
    }

    // If ignored, check if any negative pattern (!) brings it back
    if (shouldIgnore) {
      for (const pattern of this.negativePatterns) {
        if (minimatch(normalizedPath, pattern, { dot: true })) {
          shouldIgnore = false;
          break;
        }
      }
    }

    return shouldIgnore;
  }
}

class ContextCollector {
  private filter: GitignoreFilter | null = null;
  private gitRoot: string | null = null;
  private lockfilePatterns = [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Pipfile.lock",
    "poetry.lock",
    "Gemfile.lock",
    "go.sum",
    "Cargo.lock",
    "composer.lock",
    "bun.lock",
    "bun.lockb",
  ];

  constructor(private options: CollectOptions = {}) {}

  async initialize(targetDir: string): Promise<void> {
    // Find git root and collect gitignore files with root taking precedence
    let currentDir = resolve(targetDir);
    const gitignoreFiles: { path: string; content: string }[] = [];

    // Walk up to find all .gitignore files
    while (currentDir !== resolve(currentDir, "..")) {
      const gitignorePath = join(currentDir, ".gitignore");
      if (existsSync(gitignorePath)) {
        try {
          const content = await readFile(gitignorePath, "utf-8");
          gitignoreFiles.unshift({ path: gitignorePath, content }); // Add to beginning so root comes first
          // Track the topmost directory with .gitignore as git root
          this.gitRoot = currentDir;
          if (this.options.verbose) {
            console.log(`✅ Loaded .gitignore from: ${gitignorePath}`);
          }
        } catch (error) {
          if (this.options.verbose) {
            console.warn(
              `⚠️  Failed to load .gitignore from ${gitignorePath}:`,
              error
            );
          }
        }
      }
      currentDir = resolve(currentDir, "..");
    }

    // Combine all gitignore contents with root patterns first
    if (gitignoreFiles.length > 0) {
      const combinedContent = gitignoreFiles.map((f) => f.content).join("\n");
      this.filter = new GitignoreFilter(combinedContent);
      if (this.options.verbose) {
        console.log(`🎯 Git root determined as: ${this.gitRoot}`);
      }
    }
  }

  private shouldIgnoreFile(filePath: string, fileName: string): boolean {
    // Always ignore lockfiles
    if (this.lockfilePatterns.includes(fileName)) {
      return true;
    }

    // Use gitignore filter if available
    if (this.filter) {
      return this.filter.shouldIgnore(filePath);
    }

    // Fallback to basic patterns if no gitignore
    const basicIgnorePatterns = [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**",
      ".cache/**",
      ".next/**",
      "coverage/**",
      "*.log",
      ".env*",
      ".DS_Store",
      ".idea/**",
      ".vscode/**",
    ];

    return basicIgnorePatterns.some((pattern) =>
      minimatch(filePath, pattern, { dot: true })
    );
  }

  private async getAllFiles(dir: string, baseDir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const relativePath = relative(baseDir, fullPath);

        // Skip hidden files/directories unless explicitly included
        if (!this.options.includeHidden && entry.startsWith(".")) {
          continue;
        }

        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          // Check if directory should be ignored
          if (!this.shouldIgnoreFile(relativePath + "/", entry)) {
            const subFiles = await this.getAllFiles(fullPath, baseDir);
            files.push(...subFiles);
          }
        } else if (stats.isFile()) {
          // Check if file should be ignored
          if (!this.shouldIgnoreFile(relativePath, entry)) {
            files.push(relativePath);
          }
        }
      }
    } catch (error) {
      if (this.options.verbose) {
        console.warn(`⚠️  Failed to read directory ${dir}:`, error);
      }
    }

    return files;
  }

  async collect(): Promise<void> {
    const targetDir = resolve(this.options.targetDir || process.cwd());
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const baseName = basename(targetDir);

    // Create output directory
    const outputDir = this.options.outputDir || join(targetDir, ".llm-context");
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
      console.log(`📁 Created context directory: ${outputDir}`);
    }

    console.log(`🤖 Collecting LLM context from: ${targetDir}`);

    // Initialize gitignore filter
    await this.initialize(targetDir);

    // Get all files
    console.log("📋 Scanning files...");
    const allFiles = await this.getAllFiles(targetDir, targetDir);

    console.log(`📊 Found ${allFiles.length} files to include`);

    // Create combined file
    const outputFile = join(outputDir, `combined_codebase_${timestamp}.txt`);
    console.log(`📝 Creating combined file: ${outputFile}`);

    let combinedContent = "";
    combinedContent += "# COMBINED CODEBASE CONTEXT\n";
    combinedContent += `# Generated on: ${new Date().toISOString()}\n`;
    combinedContent += `# Target: ${targetDir}\n`;
    combinedContent += `# Files included: ${allFiles.length}\n`;
    combinedContent +=
      "# Note: Files are filtered using .gitignore patterns and lockfiles are excluded\n";
    combinedContent += "\n";
    combinedContent +=
      "================================================================================\n";
    combinedContent += "\n";

    let processed = 0;
    let skipped = 0;

    for (const file of allFiles.sort()) {
      const fullPath = join(targetDir, file);

      try {
        const content = await readFile(fullPath, "utf-8");

        // Add file header
        combinedContent += "\n";
        combinedContent +=
          "################################################################################\n";
        combinedContent += `# FILE PATH: ${file}\n`;
        combinedContent +=
          "################################################################################\n";
        combinedContent += "\n";

        // Add file contents
        combinedContent += content;

        // Add footer separator
        combinedContent += "\n";
        combinedContent += `# END OF FILE: ${file}\n`;
        combinedContent += "\n";

        processed++;

        if (processed % 50 === 0) {
          console.log(`⏳ Progress: ${processed} files processed`);
        }
      } catch (error) {
        // Skip binary files or files that can't be read as text
        if (this.options.verbose) {
          console.warn(`⚠️  Skipped ${file}: ${error}`);
        }
        skipped++;
      }
    }

    // Write combined file
    await writeFile(outputFile, combinedContent, "utf-8");

    // Calculate file size
    const stats = await stat(outputFile);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log("");
    console.log("✅ File collection complete!");
    console.log(`📁 Combined file saved to: ${outputFile}`);
    console.log(`📊 Files processed: ${processed}`);
    console.log(`🚫 Files skipped: ${skipped}`);
    console.log(`📏 Combined file size: ${sizeInMB} MB`);
    console.log("");
    console.log("🎉 LLM context collection complete!");
    console.log("");
    console.log("💡 Usage tips:");
    console.log(
      "   • Upload the combined file to your LLM for codebase analysis"
    );
    console.log(
      "   • Files are automatically filtered using .gitignore patterns"
    );
    console.log("   • Lockfiles and binary files are excluded");
    console.log("   • Each file is clearly marked with its original path");
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: CollectOptions = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run collect-context.ts [options] [directory]");
      console.log("");
      console.log("Options:");
      console.log("  --verbose, -v    Enable verbose output");
      console.log("  --hidden         Include hidden files/directories");
      console.log(
        "  --output, -o     Output directory (default: .llm-context)"
      );
      console.log("  --help, -h       Show this help message");
      console.log("");
      console.log("Examples:");
      console.log("  bun run collect-context.ts");
      console.log("  bun run collect-context.ts /path/to/project");
      console.log("  bun run collect-context.ts --verbose --hidden");
      process.exit(0);
    } else if (arg === "--verbose" || arg === "-v") {
      options.verbose = true;
    } else if (arg === "--hidden") {
      options.includeHidden = true;
    } else if (arg === "--output" || arg === "-o") {
      options.outputDir = args[++i];
    } else if (!arg.startsWith("-")) {
      options.targetDir = arg;
    }
  }

  const collector = new ContextCollector(options);
  await collector.collect();
}

// Run if called directly
if (import.meta.main) {
  main().catch(console.error);
}
