# @tkn

### Online, Language-Agnostic Tokenization via Lattice Discovery

## 1. Motivation & Goals

Modern tokenization pipelines are tightly coupled to large, static corpora. Foundation models are trained with fixed vocabularies (BPE, Unigram, WordPiece, etc.), and once set, the tokenizer is frozen. This introduces several challenges:

- **Language coupling:** Models inherit biases from their training corpora; adaptation to new languages, scripts, or orthographic conventions is costly.
- **Domain drift:** Slang, jargon, code tokens, and evolving usage require retraining tokenizers or accepting suboptimal fragmentation.
- **Hardware & ecosystem coupling:** Tokenizers are centralized; local or edge devices can’t adapt their vocabularies on the fly.

**Goal of this project:**

- Build an **online, byte-level, language-agnostic tokenizer** that:
  - Learns directly from raw byte streams.
  - Discovers and tracks recurring substrings as **tokens**.
  - Constructs an adjacency **lattice graph** with edge weights, token strengths, and node degrees iteratively.
  - Uses **information-theoretic gating** (MDL, entropy) rather than heuristic rules.
  - Requires **no hand-crafted, data-coupled rules**.
  - Runs on **consumer hardware in real time** (MB/s throughput).
  - Can adapt to **arbitrary domains and languages** without retraining.

This places the project at the intersection of **compression**, **unsupervised lexical discovery**, and **adaptive tokenization**.

---

## 2. Conceptual Precedents

Several strands of prior work provide context:

- **Lempel–Ziv (LZ77, LZ78, LZW):** Classic stream compressors that greedily extend substrings and emit backreferences. Our sequencer borrows the **“seen at least once” inclusion heuristic** from LZ, but reframes it as token discovery instead of compression.
- **Entropy/MDL gating:** Using surprisal (`-log p`) and entropy thresholds to decide whether to extend or emit tokens aligns with Minimum Description Length principles. This generalizes LZ’s greedy inclusion into an adaptive statistical framework.
- **Graph-based segmentation:** Early corpus linguistics used adjacency graphs and branching entropy to detect word boundaries (esp. for Chinese/Japanese). The lattice approach revives this idea but makes it **streaming, online, and language-agnostic**.
- **Subword tokenization (BPE, Unigram):** Today’s mainstream tokenizers batch-train on large corpora with iterative merges. Our system instead builds tokens incrementally, guided by stream statistics and lattice structure.

So: the novelty is in **combining online LZ-style discovery with graph adjacency + MDL gating to yield an adaptive tokenizer**.

---

## 3. Architectural Components

### 3.1 Sequencer

- **Input:** Raw byte stream.
- **Core algorithm:** Lempel-Ziv Stream (LZS).
  - Maintains a rolling **candidate** token as bytes arrive.
  - Uses **ByteTrie** with rolling cursor API for O(1) prefix checks and child degree queries.
  - Maintains counts in a **cache (LRU + rolling hash keys)**.
  - **Emission decisions**:
    - If candidate never seen before → emit previous token.
    - If MDL gates (relative surprisal vs. entropy) fail → emit.
    - Otherwise, extend candidate.
  - **Strength heuristic:** Seen at least once = extendable (classic LZ inclusion).
- **Outputs:** Tokens emitted incrementally, along with updates to token strength and adjacency edges.

### 3.2 ByteTrie

- Write-optimized trie structure with:
  - Flat edge map (`nodeId * 257 + byte` keying).
  - Typed arrays for terminals, strengths, degrees, and lastSeen ticks.
  - Rolling cursor API: advance/rollback/reset with O(1) operations.
- Role: Efficient prefix tracking + child degree lookup for entropy estimates.

### 3.3 Adjacency Lattice (SQLite backend)

- Schema: `Token(bytes, strength, degree)` and `Edge(from, to, weight)`.
- Views for:
  - Incoming/outgoing strength.
  - PMI, Dice coefficient, branching entropy.
  - Refined edges with Top-K pruning.
- Provides **global statistics**: median/percentiles for strength/degree, isolated nodes, distribution shapes.
- Bottleneck: SQLite bulk writes (<0.5MB/s). Options include batching, WAL tuning, or using DuckDB/Kuzu for analytical queries.

### 3.4 Tokenizer Inference

- Downstream: **Viterbi decoding** over the lattice.
- Finds maximum likelihood segmentation given:
  - Token strengths.
  - Edge weights.
  - Optional refinements (PMI, entropy pruning).
- Output: Probabilistic tokenizations for input sequences.

---

## 4. Evaluation Benchmarks

Because the system is **discovery-oriented, not predictive**, classic language model metrics like perplexity don’t fully capture quality. Proposed benchmarks:

**Performance:**

- Ingest throughput (MB/s).
- Latency per byte (μs).
- Memory footprint (trie + cache + DB size).
- Scale tests: 1MB → 100MB streams.

**Tokenization quality:**

- **Boundary F1:** Match against reference tokenizers (spaces for English, MeCab/Jieba for JP/ZH, UD corpora for others).
- **Compression proxy:** Avg token length; tokens/char vs. BPE/SentencePiece baselines.
- **Continuity:** % of emitted tokens later extended.
- **Graph metrics:** PMI distribution, degree/strength histograms, branching entropy.

**Ablations:**

- Trie vs. no trie.
- MDL gates on/off.
- Child-degree vs. fixed Z mode.
- Cache sizes.
- DB batch sizes.

---

## 5. Placement in the Ecosystem

Where might this fit?

- **Not a foundation tokenizer replacement.** GPT-class models are locked to their tokenizers.
- **Adapters & overlays:**
  - As a **local preprocessing layer**, mapping domain-specific spans (slang, jargon, code) to new tokens before passing to a foundation model.
  - As a **parallel tokenizer** for small, local models where new vocabularies matter.
- **Edge/consumer applications:**
  - Devices that need language-agnostic or domain-specific lexicons without retraining.
  - Interactive agents that adapt to slang/jargon over time.
- **Research tools:**
  - Studying cross-lingual token discovery.
  - Compression and segmentation analysis.

In short: this is a **discovery engine** that builds evolving token lattices, potentially feeding both small local models and overlays to foundation models.

---

## 6. Value & Novelty

- **Language-agnostic, online, adaptive** — very few tokenizers operate in this mode.
- **Streaming, unsupervised discovery** at MB/s speeds.
- **Graph + MDL integration:** Combines statistical rigor with efficient data structures.
- **Practical:** Runs on consumer CPUs, doesn’t need GPUs, can be embedded into pipelines.
