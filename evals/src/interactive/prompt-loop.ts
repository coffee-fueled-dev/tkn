import * as readline from "readline";
import type { Lattice } from "@tkn/lattice";
import { Unicode } from "@tkn/pipelines";

export function promptLoop(lattice: Lattice) {
  console.log("\n=== Interactive Tokenizer ===");
  console.log("Enter text to tokenize (or 'quit' to exit):");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = () => {
    rl.question("> ", (input: string) => {
      if (input.toLowerCase() === "quit" || input.toLowerCase() === "exit") {
        console.log("Goodbye!");
        rl.close();
        return;
      }

      if (input.trim()) {
        try {
          const tokens = lattice.tokens(Unicode.fromString(input));
          const strings = lattice.ints(tokens).map(Unicode.toString);

          logTokens(tokens, strings);
        } catch (error) {
          console.log("Error:", error);
        }
      }

      promptUser();
    });
  };

  promptUser();
}

export function logTokens(ids: bigint[], strings: string[]) {
  // Create object with strings as keys and tokens as values
  const tokenTable = strings.reduce((acc, str, i) => {
    acc[`tkn:${ids[i]}`] = str;
    return acc;
  }, {} as Record<string, string>);

  console.table([tokenTable]);
  console.log("");
}
