#!/usr/bin/env bun

import memgraph from "neo4j-driver";
import { readFileSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

interface SegmentationMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
}

interface AnalysisResult {
  sessionId: string;
  metrics: SegmentationMetrics;
  tokenCount: number;
  reconstructedText: string;
  predictedSegmentation: string;
}

class SegmentationAnalyzer {
  private driver: any;
  private corporaPath: string;

  constructor(
    memgraphUri: string = "bolt://localhost:7687",
    corporaPath: string = "corpora/brown-corpus/output"
  ) {
    this.driver = memgraph.driver(
      memgraphUri,
      memgraph.auth.basic("memgraph", "memgraph")
    );
    this.corporaPath = corporaPath;
  }

  /**
   * Load the gold standard file
   */
  private loadGoldStandard(): string {
    const goldPath = join(this.corporaPath, "brown_gold_standard.txt");
    return readFileSync(goldPath, "utf-8").trim();
  }

  /**
   * Extract boundary positions from segmented text
   * For segmentation evaluation, we treat word boundaries (spaces) as the classification targets.
   * Each boundary position represents a decision point: should there be a word break here?
   */
  private extractBoundaries(segmentedText: string): Set<number> {
    const boundaries = new Set<number>();
    let position = 0;

    for (let i = 0; i < segmentedText.length; i++) {
      if (segmentedText[i] === " ") {
        boundaries.add(position);
      } else {
        position++;
      }
    }

    return boundaries;
  }

  /**
   * Calculate segmentation metrics
   */
  private calculateMetrics(
    goldBoundaries: Set<number>,
    predictedBoundaries: Set<number>
  ): SegmentationMetrics {
    const truePositives = [...goldBoundaries].filter((boundary) =>
      predictedBoundaries.has(boundary)
    ).length;

    const falsePositives = predictedBoundaries.size - truePositives;
    const falseNegatives = goldBoundaries.size - truePositives;

    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    return {
      truePositives,
      falsePositives,
      falseNegatives,
      precision,
      recall,
      f1Score,
    };
  }

  /**
   * Retrieve token sequence from database for a session
   * Each token can have multiple OBSERVED relationships to the same session,
   * with each relationship representing a position where that token appears.
   */
  async getTokenSequence(sessionId: string): Promise<{
    tokens: Array<{ bytes: number[]; sessionIndex: number }>;
    count: number;
  }> {
    const session = this.driver.session();

    try {
      const result = await session.run(
        `
        MATCH (s:Session {id: $sessionId})<-[r:OBSERVED]-(t:Token)
        RETURN t.bytes as bytes, r.session_index as sessionIndex
        ORDER BY r.session_index ASC
      `,
        { sessionId }
      );

      const tokens = result.records.map((record: any) => {
        const sessionIndex = record.get("sessionIndex");
        return {
          bytes: record.get("bytes"),
          sessionIndex:
            typeof sessionIndex === "number"
              ? sessionIndex
              : sessionIndex.toNumber(),
        };
      });

      return { tokens, count: tokens.length };
    } finally {
      await session.close();
    }
  }

  /**
   * Convert byte arrays back to text tokens
   */
  private decodeTokens(
    tokens: Array<{ bytes: number[]; sessionIndex: number }>
  ): string[] {
    return tokens.map((token) => {
      const buffer = new Uint8Array(token.bytes);
      return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    });
  }

  /**
   * Analyze segmentation for a specific session
   */
  async analyzeSession(sessionId: string): Promise<AnalysisResult> {
    console.log(`🔍 Analyzing session: ${sessionId}`);

    // Load gold standard
    const goldStandard = this.loadGoldStandard();
    const goldBoundaries = this.extractBoundaries(goldStandard);

    console.log(
      `📖 Gold standard: ${goldStandard.length} characters, ${goldBoundaries.size} boundaries`
    );

    // Get token sequence from database
    const { tokens, count } = await this.getTokenSequence(sessionId);
    console.log(`🔍 Retrieved ${count} tokens from database`);

    if (count === 0) {
      throw new Error(`No tokens found for session ${sessionId}`);
    }

    // Decode tokens back to text
    const decodedTokens = this.decodeTokens(tokens);

    // Debug: Show first few tokens to understand the data
    console.log(`🔍 First 10 tokens:`, decodedTokens.slice(0, 10));
    console.log(
      `🔍 Token lengths:`,
      decodedTokens.slice(0, 10).map((t) => t.length)
    );

    // Reconstruct the full text and predicted segmentation
    const reconstructedText = decodedTokens.join("");
    const predictedSegmentation = decodedTokens.join(" ");

    console.log(
      `📝 Reconstructed text: ${reconstructedText.length} characters`
    );
    console.log(
      `📝 Predicted segmentation: ${predictedSegmentation.length} characters`
    );

    // Extract predicted boundaries
    const predictedBoundaries = this.extractBoundaries(predictedSegmentation);
    console.log(`📏 Predicted boundaries: ${predictedBoundaries.size}`);
    console.log(`📏 Gold boundaries: ${goldBoundaries.size}`);

    // Debug: Show some boundary positions
    const predictedArray = Array.from(predictedBoundaries).slice(0, 10);
    const goldArray = Array.from(goldBoundaries).slice(0, 10);
    console.log(`🔍 First 10 predicted boundaries:`, predictedArray);
    console.log(`🔍 First 10 gold boundaries:`, goldArray);

    // Calculate metrics
    const metrics = this.calculateMetrics(goldBoundaries, predictedBoundaries);

    return {
      sessionId,
      metrics,
      tokenCount: count,
      reconstructedText,
      predictedSegmentation,
    };
  }

  /**
   * List all available sessions
   */
  async listSessions(): Promise<
    Array<{ id: string; tokenCount: number; status: string }>
  > {
    const session = this.driver.session();

    try {
      const result = await session.run(`
        MATCH (s:Session)
        OPTIONAL MATCH (s)<-[r:OBSERVED]-(t:Token)
        RETURN s.id as id, s.status as status, count(r) as tokenCount
      `);

      return result.records.map((record: any) => {
        const tokenCount = record.get("tokenCount");
        return {
          id: record.get("id"),
          status: record.get("status"),
          tokenCount:
            typeof tokenCount === "number" ? tokenCount : tokenCount.toNumber(),
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Find the most recent session with tokens
   */
  async findLatestSession(): Promise<string | null> {
    const sessions = await this.listSessions();
    const sessionsWithTokens = sessions.filter((s) => s.tokenCount > 0);

    if (sessionsWithTokens.length === 0) {
      return null;
    }

    return sessionsWithTokens[0].id;
  }

  /**
   * Print analysis results
   */
  printResults(result: AnalysisResult, compact: boolean = false) {
    if (compact) {
      // Compact format for sequential testing
      console.log(
        `${result.sessionId},${
          result.tokenCount
        },${result.metrics.f1Score.toFixed(
          6
        )},${result.metrics.precision.toFixed(
          6
        )},${result.metrics.recall.toFixed(6)},${
          result.metrics.truePositives
        },${result.metrics.falsePositives},${result.metrics.falseNegatives}`
      );
    } else {
      // Full format
      console.log(`\n📊 SEGMENTATION ANALYSIS RESULTS`);
      console.log(`Session ID: ${result.sessionId}`);
      console.log(`Token Count: ${result.tokenCount}`);
      console.log(`-`.repeat(50));
      console.log(`F1 Score:     ${result.metrics.f1Score.toFixed(4)}`);
      console.log(`Precision:    ${result.metrics.precision.toFixed(4)}`);
      console.log(`Recall:       ${result.metrics.recall.toFixed(4)}`);
      console.log(`-`.repeat(50));
      console.log(`True Positives:  ${result.metrics.truePositives}`);
      console.log(`False Positives: ${result.metrics.falsePositives}`);
      console.log(`False Negatives: ${result.metrics.falseNegatives}`);

      // Show sample of predicted segmentation
      const sampleLength = 200;
      const sample = result.predictedSegmentation.substring(0, sampleLength);
      console.log(`\n📝 Sample predicted segmentation:`);
      console.log(
        `"${sample}${
          result.predictedSegmentation.length > sampleLength ? "..." : ""
        }"`
      );
    }
  }

  async close() {
    await this.driver.close();
  }
}

function showHelp() {
  console.log(`
🔍 TKN Segmentation Analyzer - Analyze tokenization results from Memgraph

Usage:
  bun run research:analyze [session-id] [options]

Options:
  --memgraph-uri <uri>    Memgraph URI (default: bolt://localhost:7687)
  --corpus-path <path>    Path to corpus files (default: corpora/brown-corpus/output)
  --list                  List all available sessions
  --compact               Output in CSV format for sequential analysis
  --csv-header            Print CSV header for compact output
  --help, -h              Show this help message

Examples:
  bun run research:analyze                    # Analyze latest session
  bun run research:analyze --list             # List all sessions
  bun run research:analyze <session-id>       # Analyze specific session
  bun run research:analyze <session-id> --compact  # CSV output for analysis
  bun run research:analyze --csv-header       # Print CSV header

Sequential Testing:
  bun run research:analyze --csv-header > results.csv
  for session in session1 session2 session3; do
    bun run research:analyze $session --compact >> results.csv
  done

If no session ID is provided, the most recent session with tokens will be analyzed.
`);
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "memgraph-uri": { type: "string", default: "bolt://localhost:7687" },
      "corpus-path": { type: "string", default: "corpora/brown-corpus/output" },
      list: { type: "boolean", default: false },
      compact: { type: "boolean", default: false },
      "csv-header": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      h: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || values.h) {
    showHelp();
    process.exit(0);
  }

  if (values["csv-header"]) {
    console.log(
      "session_id,token_count,f1_score,precision,recall,true_positives,false_positives,false_negatives"
    );
    process.exit(0);
  }

  const analyzer = new SegmentationAnalyzer(
    values["memgraph-uri"] as string,
    values["corpus-path"] as string
  );

  try {
    if (values.list) {
      // List all sessions
      console.log(`🔍 Listing all sessions...`);
      const sessions = await analyzer.listSessions();

      if (sessions.length === 0) {
        console.log("❌ No sessions found in database");
        return;
      }

      console.log(`\n📋 Found ${sessions.length} session(s):`);
      console.log(
        `${"Session ID".padEnd(40)} | ${"Status".padEnd(8)} | ${"Tokens".padEnd(
          8
        )}`
      );
      console.log("-".repeat(60));

      for (const session of sessions) {
        console.log(
          `${session.id.padEnd(40)} | ${session.status.padEnd(
            8
          )} | ${session.tokenCount.toString().padEnd(8)}`
        );
      }
      return;
    }

    // Determine session to analyze
    let sessionId = positionals[0];

    if (!sessionId) {
      console.log(`🔍 No session ID provided, finding latest session...`);
      const foundSessionId = await analyzer.findLatestSession();

      if (!foundSessionId) {
        console.log("❌ No sessions with tokens found in database");
        console.log("💡 Try running: bun run research:analyze --list");
        return;
      }

      sessionId = foundSessionId;
      console.log(`✅ Using latest session: ${sessionId}`);
    }

    // Analyze the session
    const result = await analyzer.analyzeSession(sessionId);
    analyzer.printResults(result, values.compact);
  } catch (error) {
    console.error(`❌ Analysis failed:`, error);
    process.exit(1);
  } finally {
    await analyzer.close();
  }
}

if (import.meta.main) {
  main();
}
