import { CodePointTrie, LZS, LZSBigram, LZSBoundary } from "@tkn/lzs";
import { jobProcessMetadata, JobRunner } from "../harness";
import { resolveFile } from "../resolve-file";
import { Ingest } from "@tkn/tokenizer";
import { promptLoop } from "./prompt-loop";

async function main() {
  console.log("🌍 Starting Interactive Eval");

  const ingest = new Ingest({ batchSize: 70_000 });

  const runner = new JobRunner({ logSequences: false });
  const results = [];

  try {
    const result = await runner.run({
      process: jobProcessMetadata(),
      source: resolveFile("tinystories_1000.txt"),
      sampleConfig: {
        run: false,
      },
      trainingConfig: {
        ingest,
        lzs: new LZSBigram(
          new LZSBoundary(
            new LZS({
              mdl: {
                zMode: "fixed",
              },
              monitor: { mode: "disabled" },
            }),
            {
              trie: new CodePointTrie(),
              mdl: {
                zMode: "child-degree",
              },
              monitor: { mode: "disabled" },
            }
          ),
          {
            monitor: { mode: "extended" },
          }
        ),
      },
      metadata: {
        language: "English Interactive Eval",
        code: "en",
      },
    });

    results.push(result);
  } catch (error) {
    console.error(`❌ Failed to process:`, error);
  }

  console.log(
    JSON.stringify(
      results.map(({ samples, ...r }) => r),
      null,
      2
    )
  );

  promptLoop(ingest.lattice);
}

main().catch(console.error);
