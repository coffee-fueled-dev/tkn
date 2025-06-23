### **Research Plan: A/B Test of BPE vs. BTM Tokenization for Small Language Model Training**

**1. Research Objective & Hypothesis**

- **Objective:** To quantitatively measure the impact of a novel tokenization pipeline (BTM: BPE-TKN-Merge) on the training efficiency of a small-scale language model compared to a standard BPE baseline.
- **Primary Hypothesis:** The BTM pipeline, by creating a more semantically coherent vocabulary, will enable a language model to achieve a lower training loss in fewer training steps (i.e., faster convergence) than a model of identical size trained with a standard BPE tokenizer.
- **Secondary Hypothesis:** The BTM-trained model will exhibit qualitatively better structural understanding in text generation tasks, despite its small size.

**2. Experimental Design: A/B Test**

This experiment consists of two parallel tracks (A and B) that are identical in every respect except for the tokenization method.

| Component       | **Track A: Baseline (BPE)** | **Track B: Experimental (BTM)** |
| :-------------- | :-------------------------- | :------------------------------ |
| **Dataset**     | TinyStories                 | TinyStories                     |
| **Tokenizer**   | **Standard BPE**            | **BPE-TKN-Merge (BTM)**         |
| **Vocab Size**  | 16,384 (Target)             | 16,384 (Target)                 |
| **Model Arch**  | ~40M GPT-2 Style            | ~40M GPT-2 Style (Identical)    |
| **Hyperparams** | Identical Set               | Identical Set                   |
| **Hardware**    | Single GPU (e.g., RTX 4090) | Single GPU (e.g., RTX 4090)     |

**3. Methodology & Implementation Plan**

This plan is divided into four main phases.

**Phase I: Dataset & Baseline Tokenizer Preparation (Track A)**

1.  **Dataset:** Download the `roneneldan/TinyStories` dataset from Hugging Face. Split into training (99%) and validation (1%) sets.
2.  **BPE Tokenizer Training:**
    - Using the `huggingface/tokenizers` library, train a BPE tokenizer on the training set.
    - **Hyperparameters:** `vocab_size = 16384`, `min_frequency = 2`.
    - Save this tokenizer as `bpe_baseline_tokenizer`.
3.  **Corpus Tokenization:** Process the entire training and validation set with `bpe_baseline_tokenizer` and save the resulting integer sequences to disk. This is the dataset for Track A.

**Phase II: Experimental Tokenizer Preparation (Track B)**

1.  **BPE Primitive Generation:**
    - Train a separate, smaller BPE tokenizer on the training set.
    - **Hyperparameters:** `vocab_size = 4096`, `min_frequency = 2`.
    - Save this as `btm_primitive_tokenizer`.
2.  **TKN Graph Construction:**
    - Develop a script that streams the training corpus, pre-tokenizes it with `btm_primitive_tokenizer`, and feeds the resulting token ID stream into the TKN `TknMiner` and `SyncStream` components.
    - **Implementation:** The graph can be an in-memory `dict` mapping `(token_A_id, token_B_id)` to a frequency count. Persist this graph to disk.
3.  **Contextual Merge Process:**
    - Develop a script to perform iterative merges on the TKN graph.
    - **Simplified Heuristic (v1):** The merge score will be the raw frequency of an adjacent pair in the graph.
    - **Process:**
      - Identify the most frequent adjacent pair `(A, B)` in the graph.
      - Create a new merged token `M_1`. Record the merge rule (`A, B -> M_1`).
      - Update the graph: Replace all instances of the sequence `A, B` with `M_1`, recalculating frequencies.
      - Repeat until the total vocabulary (`primitive_tokens + merged_tokens`) reaches the target size of **16,384**.
    - Save the final vocabulary and the full list of merge rules as `btm_experimental_tokenizer`.
4.  **Corpus Tokenization:** Process the entire training and validation set with the `btm_experimental_tokenizer` (a two-step process: apply primitive tokenizer, then apply merge rules). Save the resulting integer sequences. This is the dataset for Track B.

**Phase III: Model Training**

1.  **Model Definition:**
    - Define a standard GPT-2 style decoder-only Transformer architecture using PyTorch (e.g., adapting `nanoGPT`).
    - Configure the model to have approximately **40 million parameters**. Key parameters to tune are `n_layer`, `n_head`, and `n_embd`. Fix these for both tracks.
2.  **Training Loop:**
    - Set fixed training hyperparameters for both tracks:
      - `batch_size`: (e.g., 32, as large as VRAM allows)
      - `learning_rate`: (e.g., `3e-4`)
      - `optimizer`: AdamW
      - `num_epochs`: 1 or 2 (or train for a fixed number of steps, e.g., 50,000).
3.  **Execution:**
    - **Run A:** Train the model on the Track A dataset.
    - **Run B:** Train the model on the Track B dataset.
4.  **Logging & Metrics:** For both runs, log the following at regular intervals (e.g., every 100 steps):
    - Training Loss
    - Validation Loss
    - Timestamp
    - Current Learning Rate

**Phase IV: Analysis & Evaluation**

1.  **Primary Analysis (Quantitative):**
    - Plot **Validation Loss vs. Training Steps** for both Track A and Track B on a single chart.
    - Plot **Validation Loss vs. Wall-Clock Time** on a second chart.
    - **Success Criterion:** The BTM curve (Track B) should be consistently lower than the BPE curve (Track A) and/or reach a specific loss value in fewer steps/less time.
2.  **Secondary Analysis (Qualitative):**
    - After training is complete (or at a fixed checkpoint), use both models to generate text from a set of 10-20 identical prompts.
    - **Prompts should test for structural understanding**, e.g., "Once upon a time, there was a knight who said to the dragon,", "The recipe is as follows: first, you take an egg and", etc.
    - Qualitatively compare the coherence, syntactic correctness, and creativity of the generated samples.
3.  **Tokenizer Analysis:**
    - Inspect the vocabularies. What kinds of tokens did the BTM process create? Are they intuitively more "semantic" than the BPE tokens?
    - Compare the average number of tokens per document for each tokenizer to quantify the compression rate.

**4. Expected Outcome & Potential Risks**

- **Expected Outcome:** We anticipate seeing a measurable improvement in training efficiency (a lower loss curve) for the BTM model. The qualitative results may be subtle but could show evidence of better structural modeling.
- **Risks:**
  - **Implementation Complexity:** The merge process (Phase II.3) is the most complex part to implement. A bug here could invalidate the results.
  - **No Measurable Difference:** The effect at this small scale might be too small to measure reliably, resulting in inconclusive data.
  - **Worse Performance:** The BTM pipeline could, unexpectedly, perform worse if the merge heuristic is flawed, leading to a less effective vocabulary. This would still be a valuable scientific result.
