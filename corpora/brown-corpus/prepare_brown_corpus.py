#!/usr/bin/env python3
"""
Brown Corpus Preparation Script for Unsupervised Segmentation Experiments

This script prepares the NLTK Brown Corpus for use with the TKN CLI tool.
It creates two files in the output/ directory:
1. output/brown_unsegmented.txt - concatenated text without spaces (input for TKN)
2. output/brown_gold_standard.txt - space-separated words (ground truth for evaluation)
"""

import nltk
import re
import os
from pathlib import Path

# Configuration
OUTPUT_DIR = Path("output")
OUTPUT_UNSEGMENTED_FILE = OUTPUT_DIR / "brown_unsegmented.txt"
OUTPUT_GOLD_STANDARD_FILE = OUTPUT_DIR / "brown_gold_standard.txt"
MAX_WORDS = None  # Set to a number to limit corpus size for testing, None for full corpus

def ensure_nltk_data():
    """Download required NLTK data if not already present."""
    print("🔍 Checking NLTK data availability...")
    
    try:
        nltk.data.find('corpora/brown')
        print("✅ Brown corpus data found")
    except LookupError:
        print("📥 Downloading Brown corpus data...")
        nltk.download('brown')
    
    try:
        nltk.data.find('tokenizers/punkt')
        print("✅ Punkt tokenizer found")
    except LookupError:
        print("📥 Downloading Punkt tokenizer...")
        nltk.download('punkt')

def prepare_corpus():
    """
    Processes the NLTK Brown Corpus to create an unsegmented input file
    and a gold-standard segmented file for evaluation.
    """
    print("\n🤖 NLTK Brown Corpus Preparation Script")
    print("=" * 50)
    
    # Ensure NLTK data is available
    ensure_nltk_data()
    
    # Import after ensuring data is available
    from nltk.corpus import brown
    
    print(f"\n📚 Loading Brown Corpus from NLTK...")
    # The Brown Corpus in NLTK is a list of lists of words.
    sents = brown.sents()
    print(f"✅ Loaded {len(sents):,} sentences.")

    all_gold_words = []
    
    # This regex will keep only alphabetic characters.
    # It removes numbers, punctuation, and symbols.
    pattern = re.compile(r'[^a-z]')

    print("🔄 Processing sentences: converting to lowercase and removing punctuation/numbers...")
    
    word_count = 0
    for sent in sents:
        for word in sent:
            # 1. Convert to lowercase
            lower_word = word.lower()
            # 2. Remove all non-alphabetic characters
            clean_word = pattern.sub('', lower_word)
            # 3. Only add the word if it's not empty after cleaning
            if clean_word:
                all_gold_words.append(clean_word)
                word_count += 1
                
                # Stop if we've reached the word limit
                if MAX_WORDS and word_count >= MAX_WORDS:
                    print(f"🛑 Reached word limit of {MAX_WORDS:,}")
                    break
        
        if MAX_WORDS and word_count >= MAX_WORDS:
            break
    
    print(f"✅ Processed {len(all_gold_words):,} total words.")

    # Create output directory if it doesn't exist
    OUTPUT_DIR.mkdir(exist_ok=True)
    print(f"📁 Output directory: {OUTPUT_DIR.absolute()}")

    # --- Create the Gold Standard File ---
    print(f"📝 Writing gold standard file to: {OUTPUT_GOLD_STANDARD_FILE}")
    with open(OUTPUT_GOLD_STANDARD_FILE, "w", encoding="utf-8") as f:
        # Join all cleaned words with a single space
        f.write(" ".join(all_gold_words))
    
    gold_size = OUTPUT_GOLD_STANDARD_FILE.stat().st_size
    print(f"✅ Gold standard file created ({gold_size:,} bytes)")

    # --- Create the Unsegmented Input File ---
    print(f"📝 Writing unsegmented input file to: {OUTPUT_UNSEGMENTED_FILE}")
    with open(OUTPUT_UNSEGMENTED_FILE, "w", encoding="utf-8") as f:
        # Join all cleaned words with NO space
        f.write("".join(all_gold_words))
    
    unsegmented_size = OUTPUT_UNSEGMENTED_FILE.stat().st_size
    print(f"✅ Unsegmented file created ({unsegmented_size:,} bytes)")

    # --- Final Sanity Check ---
    print("\n🔍 Sanity Check")
    print("-" * 20)
    
    with open(OUTPUT_GOLD_STANDARD_FILE, "r", encoding="utf-8") as f:
        gold_content = f.read(100)  # Read first 100 chars
        print(f"Gold Standard start: '{gold_content}...'")
        
    with open(OUTPUT_UNSEGMENTED_FILE, "r", encoding="utf-8") as f:
        unsegmented_content = f.read(100)  # Read first 100 chars
        print(f"Unsegmented start:   '{unsegmented_content}...'")
    
    # Calculate some statistics
    total_chars = len("".join(all_gold_words))
    avg_word_length = total_chars / len(all_gold_words) if all_gold_words else 0
    
    print(f"\n📊 Corpus Statistics")
    print("-" * 20)
    print(f"Total words: {len(all_gold_words):,}")
    print(f"Total characters: {total_chars:,}")
    print(f"Average word length: {avg_word_length:.2f} characters")
    print(f"Unique words: {len(set(all_gold_words)):,}")
        
    print("\n✅ Corpus preparation complete!")
    print("\n💡 Next steps:")
    print(f"   1. Use '{OUTPUT_UNSEGMENTED_FILE}' as input to your TKN CLI")
    print(f"   2. Use '{OUTPUT_GOLD_STANDARD_FILE}' as ground truth for evaluation")
    print(f"   3. Example CLI command:")
    print(f"      bun run cli:brown -- {OUTPUT_UNSEGMENTED_FILE}")
    print(f"   4. Example BPE command:")
    print(f"      bun run corpus:bpe {OUTPUT_GOLD_STANDARD_FILE}")

def main():
    """Main entry point."""
    try:
        prepare_corpus()
    except KeyboardInterrupt:
        print("\n\n⚠️  Process interrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        raise

if __name__ == "__main__":
    main() 