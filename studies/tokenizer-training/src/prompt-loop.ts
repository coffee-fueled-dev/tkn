import { Lattice, Tokenizer } from "@tkn/tokenizer";
import * as readline from "readline";

export function promptLoop(lattice: Lattice) {
  const tokenizer = new Tokenizer(lattice);

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
        lattice.close();
        return;
      }

      if (input.trim()) {
        try {
          const tokens = tokenizer.decode(input);
          const strings = tokenizer.toStrings(tokens);
          const perplexity = tokenizer.computePerplexity(tokens);

          console.log("Tokens:", strings);
          console.log("Token IDs:", tokens);
          console.log("Perplexity:", perplexity.perplexity.toFixed(2));
          console.log("Transitions:", perplexity.transitions);
          console.log("");
        } catch (error) {
          console.log("Error:", error);
        }
      }

      promptUser();
    });
  };

  promptUser();
}
