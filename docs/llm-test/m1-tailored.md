### **Research Plan: A Comparative Analysis of Tokenization Strategies on Resource-Constrained Hardware**

**1. Research Objective & Core Hypotheses**

- **Objective:** To evaluate and benchmark three distinct tokenization pipelines (BPE, BTM, Pure TKN) on their impact on language model training efficiency, specifically under the constraints of an M1 Mac with 8GB of RAM.
- **Hypotheses:**
  1.  **H1 (Efficiency):** Both hybrid BTM and Pure TKN models will converge faster (achieve lower validation loss in fewer steps) than the standard BPE baseline.
  2.  **H2 (Stability):** The BTM model (BPE-primed) will exhibit a smoother loss curve and a more stable final vocabulary than the Pure TKN model, providing a good balance of performance and reproducibility.
  3.  **H3 (Discovery):** The Pure TKN model will discover the most "natural" and structurally insightful vocabulary, even if its performance is more variable.

**2. Experimental Design: A/B/C Test (M1-Scaled)**

All three tracks will use an identical model architecture, dataset, and training configuration.

| Component      | **Track A: Baseline** | **Track B: Hybrid**     | **Track C: Pure**    |
| :------------- | :-------------------- | :---------------------- | :------------------- |
| **Tokenizer**  | **Standard BPE**      | **BPE-TKN-Merge (BTM)** | **Pure TKN**         |
| **Dataset**    | TinyStories           | TinyStories             | TinyStories          |
| **Vocab Size** | **8,192** (Target)    | **8,192** (Target)      | **8,192** (Target)   |
| **Model Arch** | **~15M GPT-2 Style**  | **~15M GPT-2 Style**    | **~15M GPT-2 Style** |
| **Hardware**   | M1 Mac (8GB RAM)      | M1 Mac (8GB RAM)        | M1 Mac (8GB RAM)     |

**3. Methodology: Scaled-Down Implementation**

**Phase I: Shared Components**

1.  **Dataset:** TinyStories (train/validation split).
2.  **Model Definition:**
    - Define a GPT-2 style model in PyTorch (`llm.c` or `nanoGPT` are ideal).
    - **M1-Specific Configuration:** Target **~15 Million parameters**. (e.g., `n_layer=8`, `n_head=8`, `n_embd=512`). This size is a safe choice for 8GB of unified memory.
3.  **Training Configuration:**
    - **Backend:** PyTorch with `mps` device.
    - **Precision:** `bfloat16` for memory and speed.
    - **Batch Size:** A small physical batch size (e.g., 8 or 16).
    - **Gradient Accumulation:** Use `accumulation_steps` to achieve a larger effective batch size (e.g., effective batch size of 512).
    - **Training Schedule:** Fixed number of steps (e.g., **20,000 steps** for each run) with a cosine learning rate decay. This ensures each model gets the exact same computational budget.

**Phase II: Tokenizer Generation**

1.  **Track A (BPE Baseline):**

    - Train a standard BPE tokenizer on the corpus with `vocab_size = 8192`.
    - Save as `bpe_8k_tokenizer`.

2.  **Track B (BTM Hybrid):**

    - **BPE Primitives:** Train a smaller BPE tokenizer with `vocab_size = 2048`. Save as `btm_2k_primitives`.
    - **TKN Graph:** Stream the corpus, pre-tokenize with `btm_2k_primitives`, and feed the ID stream into the TKN graph generator.
    - **Merge:** Iteratively merge the most frequent adjacent pairs in the graph until the total vocabulary size reaches **8,192**. Save as `btm_8k_tokenizer`.

3.  **Track C (Pure TKN):**
    - **Shuffle:** Create a single, randomly shuffled version of the training corpus.
    - **TKN Graph:** Stream the shuffled corpus **character by character** into the TKN graph generator.
    - **Merge:** Iteratively merge the most frequent adjacent pairs until the total vocabulary size reaches **8,192**. Save as `pure_tkn_8k_tokenizer`.

**Phase III: Model Training & Execution**

1.  **Tokenize Data:** Prepare three distinct tokenized versions of the dataset using the three tokenizers.
2.  **Run A, B, C:** Execute the training loop for each of the three models on their respective datasets for the **exact same number of training steps** (e.g., 20,000).
3.  **Parallel Execution:** Since you have two M1 machines, you can run two of the experiments concurrently to save time.
4.  **Logging:** Meticulously log validation loss at regular intervals (e.g., every 50 or 100 steps) for all three runs.

**Phase IV: Analysis & Evaluation of Outcome Metrics**

The smaller model size makes the analysis of the _learning dynamics_ even more important than the final model's "intelligence."

1.  **Primary Metric (Efficiency):**

    - Create a single plot showing the **Validation Loss vs. Training Steps** for all three models (A, B, and C).
    - **This is your money plot.** It will visually demonstrate which tokenization strategy leads to the most efficient learning. Your hypotheses predict the curves will be ordered `B < C < A` or `C < B < A` in terms of which is lowest.

2.  **Stability Analysis:**

    - Visually inspect the loss curves. Is the Pure TKN (C) curve noisier or more erratic than the BTM (B) and BPE (A) curves? This would be evidence of the impact of its less stable vocabulary.

3.  **Compression Rate Analysis:**

    - For each of the three tokenizers, calculate the total number of tokens in the validation set.
    - **Metric:** `Total Characters / Total Tokens = Characters per Token`.
    - This provides a concrete measure of the compression efficiency of each method. We expect BTM and Pure TKN to have a higher ratio than BPE.

4.  **Qualitative Analysis (Sanity Check):**
    - Generate a few text samples from each of the final models. They will likely be barely coherent.
    - The goal is not to judge prose, but to look for structural patterns. Does one model have a better grasp of forming words and using spaces correctly? Does the Pure TKN model generate interesting, non-standard but structurally valid sequences?

**Expected Timeframe on M1 (8GB):**

- With a ~15M parameter model, a run of 20,000 steps should be achievable in approximately **4-8 hours**. This makes the entire set of experiments feasible within a single weekend.
