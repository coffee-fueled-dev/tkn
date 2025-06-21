# BPE Baseline for TKN Server Symbol Table Preloading

This script builds a 2048-token BPE (Byte-Pair Encoding) vocabulary from TinyStories and creates preload data for the TKN server's symbol table. This reduces cold start times by preloading common tokens.

## Quick Start

### Option 1: Auto-download TinyStories (requires `datasets` library)

```bash
# Install optional dependency
pip install datasets

# Build BPE baseline (downloads ~100k TinyStories automatically)
python scripts/build_bpe_baseline.py

# Output files created in ./tokenizers/
```

### Option 2: Use your own text file

```bash
# No dependencies needed - use any text file
python scripts/build_bpe_baseline.py --input-file your_text_file.txt
```

## Output Files

The script creates two files in `./tokenizers/`:

1. **`bpe_vocab_2048.json`** - The BPE vocabulary mapping
2. **`tkn_bpe_preload_2048.json`** - Preload data for TKN server

## Integration with TKN Server

The TKN server will automatically look for the preload file in these locations:

- `./tokenizers/tkn_bpe_preload_2048.json`
- `./tkn_bpe_preload_2048.json`

When found, it will preload these tokens into the symbol table on startup, reducing cold start latency.

## Options

```bash
python scripts/build_bpe_baseline.py --help

Options:
  --vocab-size INT     Target vocabulary size (default: 2048)
  --input-file FILE    Input text file (if not provided, downloads TinyStories)
  --output-dir DIR     Output directory (default: ./tokenizers)
  --max-stories INT    Max stories to download for training (default: 100k)
```

## Example Usage

```bash
# Build 4096-token vocabulary
python scripts/build_bpe_baseline.py --vocab-size 4096

# Use custom text file
python scripts/build_bpe_baseline.py --input-file datasets/my_corpus.txt

# Output to different directory
python scripts/build_bpe_baseline.py --output-dir ./my_tokenizers
```

## How It Works

1. **Downloads/reads text**: Gets TinyStories sample or uses your file
2. **Builds BPE vocabulary**: Creates tokens by merging frequent character pairs
3. **Generates hashes**: Creates hashes compatible with TKN server's cyrb53 hashing
4. **Creates preload file**: Formats data for TKN server symbol table preloading

## Benefits

- **Reduced cold start time**: Common tokens are pre-hashed and available immediately
- **Better compression**: BPE tokens represent frequent patterns efficiently
- **TinyStories optimized**: Vocabulary tuned for simple, story-like text
- **Seamless integration**: Works with existing TKN server architecture

## Research Context

Based on research showing that:

- 2048-8192 token vocabularies work well for small models
- BPE performs similarly to other tokenization strategies
- Custom vocabularies outperform general-purpose ones for specific domains
- TinyStories provides good baseline vocabulary for simple English text
