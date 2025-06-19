Excellent question. This gets to the very heart of why the TKN-Merge hybrid is so powerful. Let's develop a theoretical understanding of the compression rate by modeling the two phases separately and then combining them.

We define **Compression Rate (C)** as the ratio of the final encoded size to the original data size. A lower `C` indicates better compression.

`C = (Final Bit Size) / (Original Bit Size)`

### The Two-Phase Compression Model

The TKN-Merge process achieves compression in two distinct stages:

1.  **Phase 1: Structural Compression (TKN Streaming)**: This phase converts the raw data stream `S` into a shorter sequence of "primitive" tokens `P`. It finds and replaces structural repetitions.
2.  **Phase 2: Semantic Compression (Offline Merging)**: This phase takes the sequence of primitive tokens `P` and replaces high-frequency/high-similarity pairs with new, more abstract tokens, resulting in the final token sequence `M`.

The total compression rate `C_total` is the product of the compression rates of each phase:
`C_total = C_structural * C_semantic`

---

### **Phase 1: Modeling Structural Compression (`C_structural`)**

This phase takes a raw stream `S` and produces a sequence of primitive tokens `P`.

- **Input Size:** The theoretical size of the input stream `S` is `|S| * H_source`, where `|S|` is the number of items (e.g., characters) and `H_source` is the entropy of the source (in bits per item).
- **Output Size:** The TKN process outputs a sequence `P` of `|P|` primitive tokens. To store this sequence, we need an index for each token pointing into the primitive vocabulary `V_p`. The size is `|P| * log₂(|V_p|)`.

The compression rate of this phase is:
`C_structural = (|P| * log₂(|V_p|)) / (|S| * H_source)`

Let's break down the variables:

- `|S| / |P| = L_avg`: This is the average number of source items that make up a single primitive token. This is the core achievement of the TKN algorithm. For highly structured data, `L_avg` is high. For random data, `L_avg` approaches 1.
- `|V_p|`: The size of the primitive vocabulary discovered by TKN. This is an emergent property of the data's complexity and the bank size.

Substituting `L_avg`, the formula becomes:
`C_structural = log₂(|V_p|) / (L_avg * H_source)`

**Theoretical Insight:** Structural compression is effective when the algorithm can discover long, repeating primitive tokens (`L_avg` is large) from a source that has inherent structure (`H_source` is low).

---

### **Phase 2: Modeling Semantic Compression (`C_semantic`)**

This phase takes the sequence of primitive tokens `P` and produces the final merged sequence `M`.

- **Input Size:** The sequence `P`, with bit size `|P| * log₂(|V_p|)`.
- **Output Size:** The final sequence `M`, with bit size `|M| * log₂(|V_m|)`. Here, `V_m` is the final, fixed-size vocabulary (e.g., `|V_m|` = 50,000).

The compression rate of this phase is:
`C_semantic = (|M| * log₂(|V_m|)) / (|P| * log₂(|V_p|))`

The core of the merge process is reducing the sequence length (`|P|` -> `|M|`). Every successful merge of a pair `(T_A, T_B)` into `T_AB` reduces the total sequence length by one. If we perform `k` total merges across the corpus:
`|M| = |P| - k`

Substituting this, we get:
`C_semantic ≈ ((|P| - k) / |P|) * (log₂(|V_m|) / log₂(|V_p|))`

**Theoretical Insight:** The effectiveness of semantic compression depends on two factors:

1.  **Merge Ratio (`k / |P|`)**: What percentage of the primitive token sequence can be collapsed via merges? This is the crucial variable.
2.  **Vocabulary Size Ratio**: The ratio of the bit-cost of the final vocabulary (`log₂(|V_m|)`) to the primitive vocabulary (`log₂(|V_p|)`).

### The Heart of the Merge: Exploiting Mutual Information

What determines the **Merge Ratio (`k / |P|`)**? This is where the contextual merging based on "edge similarity" becomes critical.

The merge process is, in information-theoretic terms, an algorithm for finding and compressing pairs of primitive tokens `(T_A, T_B)` that have **high mutual information**.

- **Mutual Information (`I(T_A; T_B)`)**: This measures how much knowing `T_A` reduces the uncertainty about `T_B`. It's high when the pair `(T_A, T_B)` appears much more frequently than would be expected if they were independent.
- **The Merge Heuristic**: A good merge score (`Frequency * CosineSimilarity`) is a proxy for high mutual information.
  - **Frequency** directly measures `P(T_A, T_B)`.
  - **Contextual Similarity** (from Node2Vec) implies that `P(T_B | T_A)` is high and stable across different contexts.

**Therefore, the number of effective merges `k` is proportional to the sum of the mutual information over all discoverable, high-frequency pairs in the primitive token graph.** The algorithm succeeds by converting the implicit statistical relationship between two tokens into a single, more efficient symbol.

### The Overall Compression Rate (`C_total`)

Combining both phases, the final compression rate is:

`C_total = [log₂(|V_p|) / (L_avg * H_source)] * [((|P| - k) / |P|) * (log₂(|V_m|) / log₂(|V_p|))]`

This simplifies to:

`C_total = (1 - k/|P|) * log₂(|V_m|) / (L_avg * H_source)`

### Conclusion and Key Takeaways

This theoretical model provides a clear understanding of the TKN-Merge compression.

1.  **Two-Tiered Compression:** The system first performs a "coarse-grained" structural compression by finding long, exact repeats (`L_avg`). It then performs a "fine-grained" semantic compression by finding and abstracting statistically dependent token pairs (`k/|P|`).

2.  **Control Knobs:**

    - The **TKN phase** is self-organizing and depends on the data's inherent structure (`H_source`).
    - The **Merge phase** is controlled by a key hyperparameter: the target vocabulary size `|V_m|`.

3.  **Source of Power:** The approach is powerful because the TKN phase produces a very clean, structurally significant set of primitives. This "cleans up" the data, making the statistical relationships between the primitives much clearer and easier for the merge phase to exploit. It's finding the "right alphabet" (`V_p`) before it tries to find the "right words" (`V_m`).

4.  **Theoretical Limit:** The final compression rate is bounded by the Shannon entropy of the source data. The TKN-Merge process is a practical, two-stage heuristic for approaching that theoretical limit. It first captures low-order entropy (long repeats) and then captures higher-order entropy (contextual dependencies between primitives).
