### **Research Plan: Evaluating "Pure TKN" Streaming Tokenization**

**1. Research Objective & Hypothesis**

- **Objective:** To evaluate the viability and characteristics of a "pure TKN" tokenizer—which learns directly from a raw byte/character stream—against a standard BPE baseline for small-scale language model training.
- **Primary Hypothesis:** Despite its path-dependent nature, the pure TKN tokenizer will discover a more structurally natural vocabulary from the data, leading to a language model that converges significantly faster (lower loss in fewer steps) than a BPE-trained equivalent.
- **Secondary Hypothesis:** The path dependence of the pure TKN tokenizer will be manageable for a static, shuffled dataset, and the resulting model will exhibit superior handling of syntactic and structural regularities in text generation.

**2. Experimental Design: A/B/C Test (Optional 3-way Comparison)**

This plan can be a simple A/B test against the BPE baseline, or a 3-way test including the BTM model from the first research plan for a richer comparison.

| Component       | **Track A: Baseline (BPE)** | **Track C: Experimental (Pure TKN)** |
| :-------------- | :-------------------------- | :----------------------------------- |
| **Dataset**     | TinyStories                 | TinyStories                          |
| **Tokenizer**   | **Standard BPE**            | **Pure TKN**                         |
| **Vocab Size**  | 16,384 (Target)             | 16,384 (Target)                      |
| **Model Arch**  | ~40M GPT-2 Style            | ~40M GPT-2 Style (Identical)         |
| **Hyperparams** | Identical Set               | Identical Set                        |
| **Hardware**    | Single GPU                  | Single GPU                           |

**3. Methodology & Implementation Plan**

**Phase I: Dataset & Baseline Tokenizer Preparation (Track A)**

- _(This phase is identical to the first research plan)_
  1.  Prepare the TinyStories dataset (train/validation split).
  2.  Train a standard BPE tokenizer (`bpe_baseline_tokenizer`) with `vocab_size = 16384`.
  3.  Tokenize the corpus and save the integer sequences.

**Phase II: Experimental Tokenizer Preparation (Track C: Pure TKN)**

1.  **Corpus Shuffling (Crucial Step):**
    - To mitigate the most extreme effects of path dependence, create a **single, shuffled version of the training corpus.** This is a critical step to ensure that the initial state of the TKN `bank` isn't biased by a potentially unrepresentative beginning of the dataset (e.g., a long table of contents). This shuffled corpus will be used for both TKN vocabulary generation and model training.
2.  **TKN Graph Construction (from Raw Stream):**
    - Develop a script that streams the **shuffled training corpus character by character** (or byte by byte).
    - This raw stream is fed directly into the TKN `TknMiner` and `SyncStream` components.
    - The `SymbolTable` will hash individual characters or short character sequences.
    - The output is a graph where nodes represent structurally significant character sequences (e.g., `the `, ` cat`, `\n\n`, `function(`).
3.  **Merge Process (Identical to BTM):**
    - This step is conceptually the same as in the BTM plan.
    - Develop a script to perform iterative merges on the generated TKN graph.
    - **Heuristic (v1):** Use the frequency of adjacent node pairs as the merge score.
    - **Process:** Iteratively merge the highest-scoring pairs until the total vocabulary reaches the target size of **16,384**.
    - Save the final vocabulary and merge rules as `pure_tkn_tokenizer`.
4.  **Corpus Tokenization:**
    - Process the shuffled training and validation sets with the `pure_tkn_tokenizer` (a two-step process: apply TKN discovery to get primitive tokens, then apply merge rules). Save the resulting integer sequences.

**Phase III: Model Training**

- _(This phase is identical to the first research plan)_
  1.  Define the identical ~40M parameter GPT model.
  2.  Use identical training hyperparameters.
  3.  **Run A:** Train the model on the BPE-tokenized dataset.
  4.  **Run C:** Train the model on the Pure-TKN-tokenized dataset.
  5.  Log all key metrics (loss, time, etc.).

**Phase IV: Analysis & Evaluation**

1.  **Primary Analysis (Quantitative):**
    - Plot the **Validation Loss vs. Training Steps** and **vs. Wall-Clock Time** for both Track A and Track C.
    - **Success Criterion:** The Pure TKN curve (Track C) should demonstrate faster convergence than the BPE curve (Track A). It would be particularly interesting to compare this to the BTM curve from the other experiment. Is pure TKN better or worse than BTM?
2.  **Path Dependence Analysis (Novelty):**
    - **Optional but highly valuable:** Repeat the tokenizer generation (Phase II) on two different random shuffles of the corpus.
    - Compare the resulting vocabularies. How different are they? Use a metric like the [Jaccard index](https://en.wikipedia.org/wiki/Jaccard_index) to quantify the vocabulary overlap.
    - This provides a concrete measure of the real-world impact of path dependence. Is the overlap 99% (stable) or 70% (highly variable)?
3.  **Tokenizer and Generation Analysis (Qualitative):**
    - Inspect the `pure_tkn_tokenizer` vocabulary. What are the "natural units" it discovered from raw text? Did it discover concepts like words, punctuation, and code syntax on its own?
    - Compare the text generations from both models. Does the Pure TKN model have a better "feel" for natural language structure, like proper spacing, line breaks, or sentence construction?

**4. Expected Outcome & Potential Risks**

- **Expected Outcome (Optimistic):** The Pure TKN model learns fastest of all, as its vocabulary is perfectly adapted to the data's most fundamental structural units without any initial bias from BPE. The vocabulary it discovers will be highly insightful.
- **Expected Outcome (Pessimistic):** The path-dependent nature of the tokenizer, even with shuffling, creates a noisy and inconsistent vocabulary. This "messy" vocabulary makes it harder for the model to learn, leading to slower convergence than the stable BPE baseline.
- **Key Risks:**
  - **Path Dependence Overwhelms Learning:** The vocabulary might be too unstable, and the resulting loss curve could be noisy or fail to converge smoothly.
  - **Computational Cost:** Processing a large corpus character by character can be slower than processing it with a pre-tokenizer. The TKN graph generation step might be more computationally intensive than in the BTM case.
