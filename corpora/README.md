# Corpora Processing

This directory contains tools for processing text corpora and building tokenizers for the TKN system.

## Setup

Install Python dependencies:

```bash
# For BPE tokenization (required)
bun run corpus:install-deps

# For TinyStories downloading (optional)
bun run corpus:install-tinystories-deps

# Or directly
cd corpora && python3 -m pip install -r requirements.txt
cd corpora/tiny-stories-samples && python3 -m pip install -r requirements.txt
```

## BPE Tokenizer

Build a BPE tokenizer from any text file:

```bash
# From project root
bun run corpus:build-bpe <input-file.txt>

# Or directly
cd corpora && python3 build_bpe_baseline.py <input-file.txt>
```

### Options

- `--vocab-size`: Vocabulary size (default: 2048)
- `--output-dir`: Output directory (default: ./tokenizers)

### Example

```bash
# Build BPE tokenizer with custom settings
python3 build_bpe_baseline.py my_corpus.txt --vocab-size 4096 --output-dir ./my_tokenizers
```

## TinyStories Downloader

Download specific numbers of TinyStories for testing:

```bash
# From project root
bun run corpus:download-tinystories <num_stories> [options]

# Or directly
cd corpora/tiny-stories-samples && python3 download_stories.py <num_stories> [options]
```

### Examples

```bash
# Download 1000 stories
bun run corpus:download-tinystories 1000 -o small_sample.txt

# Download 50k stories
bun run corpus:download-tinystories 50000 -o medium_sample.txt

# Download with offset (skip first 10k stories)
bun run corpus:download-tinystories 5000 --start-index 10000 -o offset_sample.txt
```

## File Structure

- `bpe.py` - BPE tokenizer builder
- `requirements.txt` - Python dependencies (BPE tokenization)
- `tiny-stories-samples/download_stories.py` - TinyStories downloader
- `tiny-stories-samples/requirements.txt` - Python dependencies (TinyStories)
- `*.txt` files - Text corpora (gitignored)
- `tokenizers/` - Generated tokenizer files

## Output

The script generates a JSON file with BPE tokens ready for TKN server preloading:

- `tkn_bpe_preload_<vocab_size>.json` - Token data for server

## Integration

The generated tokenizer files can be used to preload the TKN server's symbol table for more efficient processing of similar text domains.
