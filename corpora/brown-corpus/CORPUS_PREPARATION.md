# Brown Corpus Preparation for Unsupervised Segmentation

This guide explains how to prepare the Brown Corpus for testing unsupervised segmentation with the TKN CLI tool.

## Quick Start

1. **Install Python dependencies:**

   ```bash
   bun run install-python-deps
   # or from the root: bun run install-python-deps
   ```

2. **Prepare the Brown Corpus:**

   ```bash
   bun run prepare-corpus
   # or from the root: bun run prepare-brown-corpus
   ```

3. **Run the segmentation experiment:**
   ```bash
   bun run cli:brown
   # or from the root: bun run tkn-send:brown
   ```

## What the Preparation Script Does

The `prepare_brown_corpus.py` script:

1. **Downloads the Brown Corpus** from NLTK (if not already present)
2. **Cleans the text** by:
   - Converting to lowercase
   - Removing punctuation and numbers
   - Keeping only alphabetic characters
3. **Creates two files**:
   - `corpus_data/brown_unsegmented.txt` - All words concatenated without spaces (input for TKN)
   - `corpus_data/brown_gold_standard.txt` - Space-separated words (ground truth for evaluation)

## Output Files

### brown_unsegmented.txt

```
thefultoncountygrandjurysaidfridayaninvestigationofatlantasrecentprimaryelectionproducednoevidencethat...
```

### brown_gold_standard.txt

```
the fulton county grand jury said friday an investigation of atlantas recent primary election produced no evidence that...
```

## Corpus Statistics

The Brown Corpus typically contains:

- ~1,000,000+ words
- ~50,000+ unique words
- Average word length: ~4.5 characters
- ~57,000 sentences

## Evaluation

After running TKN on the unsegmented text, you can evaluate the results by comparing:

- **Input**: `brown_unsegmented.txt` (no spaces)
- **TKN Output**: Segmented text with discovered word boundaries
- **Gold Standard**: `brown_gold_standard.txt` (correct word boundaries)

Use metrics like:

- **Precision**: Correct boundaries / Total predicted boundaries
- **Recall**: Correct boundaries / Total actual boundaries
- **F1-Score**: 2 _ (Precision _ Recall) / (Precision + Recall)

## Configuration

You can modify the script behavior by editing `prepare_brown_corpus.py`:

- `MAX_WORDS = 10000` - Limit corpus size for testing
- `MAX_WORDS = None` - Use full corpus (default)
- `OUTPUT_DIR` - Change output directory

## Troubleshooting

**NLTK Download Issues:**

```bash
python3 -c "import nltk; nltk.download('brown'); nltk.download('punkt')"
```

**Permission Issues:**

```bash
chmod +x prepare_brown_corpus.py
```

**Python Version:**
Requires Python 3.6+ with `nltk` package.
