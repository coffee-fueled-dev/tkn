### **Research Plan: Evaluating the LZST Algorithm on Unsupervised Word Segmentation**

**1. Research Objective & Hypothesis**

- **Objective:** To quantitatively evaluate the performance of the novel `LZST` (Lempel-Ziv Stream Tokenizer) algorithm on the canonical task of unsupervised word segmentation, using the Brown Corpus as a benchmark.
- **Primary Hypothesis:** The `LZST` algorithm, a streaming, heuristic-based method, will achieve segmentation accuracy (measured by F1-score) that is competitive with established, non-streaming, batch-processing algorithms like Morfessor.
- **Secondary Hypothesis:** The segmentation performance of `LZST` will be sensitive to the `max` size of its short-term memory (the LRU cache), revealing a clear trade-off between memory allocation and segmentation accuracy.

**2. Materials & Setup**

1.  **Corpus:** The NLTK Brown Corpus.
2.  **Hardware:** M1 Mac (or any standard desktop/laptop). This experiment is CPU-bound and not resource-intensive.
3.  **Software:**
    - A Python script using `nltk` to prepare the corpus (`prepare_brown_corpus.py`).
    - Your existing TKN Server codebase, specifically the `LZST` class implementation.
    - A new evaluation script (`evaluate_segmentation.ts` or similar) written in TypeScript/Bun to run the experiment and compute the F1-score.

**3. Experimental Methodology**

This experiment follows a standard methodology for this task.

**Phase I: Data Preparation**

1.  **Action:** Run the `prepare_brown_corpus.py` script.
2.  **Inputs:** The raw Brown Corpus from the NLTK library.
3.  **Outputs:**
    - `brown_gold_standard.txt`: The entire corpus, cleaned (lowercase, no punctuation), with words separated by single spaces. This is the **ground truth**.
    - `brown_unsegmented.txt`: The entire corpus as a single, continuous string of characters with no spaces or delimiters. This is the **input for the LZST algorithm**.

**Phase II: Segmentation with LZST**

1.  **Action:** Develop an evaluation script (`evaluate_segmentation.ts`). This script will perform the following steps for a given set of hyperparameters.
2.  **For each hyperparameter configuration (e.g., a specific cache size):**
    a. **Initialization:** Instantiate the `LZST` class with a **new, empty LRU cache** of a specified size (`max`). This ensures a pure unsupervised test.
    b. **Processing:** Read the entire contents of `brown_unsegmented.txt` into a buffer and process it using the `lzst.processBuffer()` method.
    c. **Token Collection:** Collect all the non-null `OutputToken` objects emitted by the `LZST` instance during processing. Don't forget to call `lzst.flush()` at the end to get the final token in the window.
    d. **Output Generation:** Decode the `buffer` of each `OutputToken` into a string. Concatenate these strings, separated by spaces, to create the `lzst_predicted_segmentation.txt` file.

**Phase III: Evaluation**

1.  **Action:** The evaluation script will compare the predicted segmentation against the gold standard.
2.  **Boundary Set Generation:**
    - **Gold Boundaries:** Read `brown_gold_standard.txt`. Create a `Set<number>` containing the character indices of every word boundary (i.e., the position of each space).
    - **Predicted Boundaries:** Read the `lzst_predicted_segmentation.txt` file. Create a `Set<number>` containing the character indices of the boundaries predicted by `LZST`.
3.  **Metrics Calculation:**
    - `True Positives (TP)`: The size of the intersection of the two boundary sets.
    - `False Positives (FP)`: The number of predicted boundaries not in the gold set.
    - `False Negatives (FN)`: The number of gold boundaries not in the predicted set.
4.  **F1-Score Calculation:**
    - `Precision = TP / (TP + FP)`
    - `Recall = TP / (TP + FN)`
    - `F1-Score = 2 * (Precision * Recall) / (Precision + Recall)`

**4. Experiments to Run**

To fully test the hypotheses, you will run a sweep over the key hyperparameter.

- **Experiment 1: Impact of Cache Size (`bank_size`)**

  - **Goal:** To test the Secondary Hypothesis regarding the memory/accuracy trade-off.
  - **Procedure:** Run the entire experiment (Phase II and III) multiple times, varying the `max` size of the LRU cache passed to the `LZST` constructor.
  - **Suggested Values:** `[1000, 5000, 10000, 50000, 100000, 500000, 1000000]`
  - **Output:** A table and a plot of **Cache Size vs. F1-Score, Precision, and Recall.**

- **Experiment 2: Comparison with BPE-Priming (Optional but Recommended)**
  - **Goal:** To quantify the benefit of using prior knowledge.
  - **Procedure:**
    1.  Create a small BPE vocabulary (e.g., 2048 tokens) from a separate text source (like TinyStories).
    2.  Run the segmentation experiment again, but this time, **preload the LZST cache** with all the tokens from the BPE vocabulary before processing the Brown Corpus.
    3.  Report the F1-score for this "BPE-Primed LZST" model.

**5. Analysis and Interpretation of Results**

1.  **Baseline Comparison:** Search academic papers for published F1-scores of unsupervised word segmentation on the Brown Corpus. Key algorithms to look for are **Morfessor** and **N-gram-based segmenters**.
2.  **Analyze the Cache Size Plot:** Does the F1-score increase with cache size? Does it plateau? This will reveal the optimal memory footprint for the algorithm on this task.
3.  **Error Analysis:** Manually inspect some of the False Positive and False Negative errors.
    - _False Positives (over-segmentation):_ Where is the algorithm placing incorrect boundaries? Likely on rare words.
    - _False Negatives (under-segmentation):_ What words is the algorithm failing to split apart? Likely fused common words.
4.  **Draw Conclusions:**
    - Was the primary hypothesis supported? Is the LZST F1-score competitive (e.g., within 5-10% of Morfessor)?
    - Was the secondary hypothesis supported? How did cache size affect performance?
    - How did the BPE-primed version compare? This demonstrates the algorithm's potential in a semi-supervised setting.
