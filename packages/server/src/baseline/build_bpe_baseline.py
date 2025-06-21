#!/usr/bin/env python3
"""
Build a proper 2048-token BPE tokenizer from TinyStories dataset
for preloading the TKN server symbol table.
"""

import os
import json
import argparse
import struct
from typing import Dict, List, Any, Optional, Union
from pathlib import Path

def cyrb53(data: str, seed: int = 0, hash_size: int = 64) -> bytes:
    """
    Python implementation of cyrb53 hash that matches the TKN server exactly.
    """
    h1 = 0xdeadbeef ^ seed
    h2 = 0x41c6ce57 ^ seed
    
    # Process each character
    for char in data:
        ch = ord(char)
        h1 = ((h1 ^ ch) * 2654435761) & 0xFFFFFFFF
        h2 = ((h2 ^ ch) * 1597334677) & 0xFFFFFFFF
    
    # Final mixing
    h1 = ((h1 ^ (h1 >> 16)) * 2246822507) & 0xFFFFFFFF
    h1 ^= ((h2 ^ (h2 >> 13)) * 3266489909) & 0xFFFFFFFF
    h2 = ((h2 ^ (h2 >> 16)) * 2246822507) & 0xFFFFFFFF
    h2 ^= ((h1 ^ (h1 >> 13)) * 3266489909) & 0xFFFFFFFF
    
    # Create hash buffer (matching the TypeScript implementation)
    result = bytearray(hash_size)
    bytes_to_fill = min(8, hash_size)
    
    for i in range(bytes_to_fill):
        if i < 4:
            result[i] = (h2 >> (i * 8)) & 0xFF
        else:
            result[i] = (h1 >> ((i - 4) * 8)) & 0xFF
    
    return bytes(result)

def create_storage_key(hash_bytes: bytes) -> str:
    """Convert hash bytes to base64 key exactly like the TKN server."""
    import base64
    return base64.b64encode(hash_bytes).decode('ascii')

def clean_bpe_token(token: str) -> Optional[str]:
    """
    Clean BPE-specific formatting to make tokens compatible with TKN server.
    - Remove </w> end-of-word markers
    - Keep the actual text content
    """
    # Remove BPE end-of-word marker
    if token.endswith('</w>'):
        return token[:-4]
    
    # Skip special tokens that aren't useful for preloading
    if token in ['<unk>', '<pad>', '<s>', '</s>']:
        return None
    
    return token

def create_proper_bpe_tokenizer(text_file: str, vocab_size: int = 2048):
    """Create a proper BPE tokenizer using the tokenizers library."""
    try:
        from tokenizers import Tokenizer
        from tokenizers.models import BPE
        from tokenizers.trainers import BpeTrainer
        from tokenizers.pre_tokenizers import Whitespace
        from tokenizers.normalizers import NFD, Lowercase, StripAccents, Sequence as NormSequence
    except ImportError:
        print("❌ tokenizers library not found. Install with: pip install tokenizers")
        return None
    
    print(f"🔧 Creating BPE tokenizer with vocab size {vocab_size}...")
    
    # Initialize a tokenizer with BPE model
    tokenizer = Tokenizer(BPE(unk_token="<unk>"))
    
    # Set up the trainer
    trainer = BpeTrainer(
        vocab_size=vocab_size,
        special_tokens=["<unk>", "<pad>", "<s>", "</s>"],
        min_frequency=2,
        continuing_subword_prefix="",
        end_of_word_suffix="</w>",
        show_progress=True
    )
    
    # Set up normalization (optional - you can remove if you want case sensitivity)
    # tokenizer.normalizer = NormSequence([NFD(), Lowercase(), StripAccents()])
    
    # Set up pre-tokenization (split on whitespace)
    tokenizer.pre_tokenizer = Whitespace()
    
    # Train the tokenizer
    print(f"📚 Training BPE tokenizer on {text_file}...")
    tokenizer.train([text_file], trainer)
    
    print(f"✅ BPE tokenizer trained with {tokenizer.get_vocab_size()} tokens")
    return tokenizer

def download_tinystories_sample(output_file: str = "tinystories_sample.txt", max_stories: int = 100000) -> Optional[str]:
    """Download a sample of TinyStories for tokenizer training."""
    print(f"📥 Downloading TinyStories sample ({max_stories:,} stories)...")
    
    try:
        from datasets import load_dataset
        dataset = load_dataset("roneneldan/TinyStories", split="train", streaming=True)
        
        with open(output_file, "w", encoding="utf-8") as f:
            for i, example in enumerate(dataset):
                if i >= max_stories:
                    break
                # Clean the text a bit
                text = example["text"].strip()
                if text:  # Only write non-empty stories
                    f.write(text + "\n\n")  # Double newline between stories
                if i % 10000 == 0:
                    print(f"   Downloaded {i:,} stories...")
        
        print(f"✅ Downloaded {max_stories:,} stories to {output_file}")
        return output_file
        
    except ImportError:
        print("❌ 'datasets' library not found. Install with: pip install datasets")
        print("   Or provide your own text file with --input-file")
        return None
    except Exception as e:
        print(f"❌ Error downloading TinyStories: {e}")
        return None

def build_bpe_tokenizer(
    input_file: Optional[str] = None,
    vocab_size: int = 2048,
    output_dir: str = "./tokenizers",
    max_stories: int = 100000
) -> bool:
    """Build BPE tokenizer and create preload files for TKN server."""
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Get input text file
    if input_file and os.path.exists(input_file):
        text_file = input_file
        print(f"📖 Using provided text file: {text_file}")
    else:
        # Download TinyStories sample
        text_file = download_tinystories_sample("tinystories_sample.txt", max_stories)
        if not text_file:
            return False
    
    # Create BPE tokenizer
    tokenizer = create_proper_bpe_tokenizer(text_file, vocab_size)
    if not tokenizer:
        return False
    
    # Get vocabulary
    vocab = tokenizer.get_vocab()
    print(f"📊 Vocabulary size: {len(vocab)} tokens")
    
    # Save vocabulary file
    vocab_file = os.path.join(output_dir, f"bpe_vocab_{vocab_size}.json")
    with open(vocab_file, "w", encoding="utf-8") as f:
        json.dump(vocab, f, indent=2, ensure_ascii=False)
    print(f"💾 Saved vocabulary to {vocab_file}")
    
    # Create TKN preload format with proper hashing
    preload_data = {}
    cleaned_tokens = []
    
    # Process each token and clean it for TKN compatibility
    for token, token_id in vocab.items():
        cleaned_token = clean_bpe_token(token)
        if cleaned_token is None:
            continue  # Skip special tokens
            
        # Create hash using the exact cyrb53 implementation
        hash_bytes = cyrb53(cleaned_token)
        storage_key = create_storage_key(hash_bytes)
        
        # Store in preload format: hash key -> original data
        preload_data[storage_key] = {
            "data": cleaned_token,
            "frequency": 1,  # Could be enhanced with actual frequency data
            "token_id": token_id,
            "original_bpe": token  # Keep track of original BPE token for reference
        }
        cleaned_tokens.append(cleaned_token)
    
    # Save preload file
    preload_file = os.path.join(output_dir, f"tkn_bpe_preload_{vocab_size}.json")
    with open(preload_file, "w", encoding="utf-8") as f:
        json.dump(preload_data, f, indent=2, ensure_ascii=False)
    
    print(f"💾 Saved TKN preload file to {preload_file}")
    print(f"📈 Preload contains {len(preload_data)} token mappings")
    
    # Show some example tokens
    print("\n🔍 Sample cleaned tokens for TKN server:")
    sample_tokens = cleaned_tokens[:10]
    for token in sample_tokens:
        hash_bytes = cyrb53(token)
        storage_key = create_storage_key(hash_bytes)
        print(f"   '{token}' -> {storage_key[:12]}...")
    
    # Test tokenization with cleaned tokens
    test_text = "Once upon a time, there was a little girl."
    encoded = tokenizer.encode(test_text)
    print(f"\n🧪 Test tokenization:")
    print(f"   Input: '{test_text}'")
    print(f"   BPE tokens: {encoded.tokens[:8]}...")  # Show first 8 tokens
    
    # Show how they'd be cleaned for TKN
    cleaned_test_tokens = [clean_bpe_token(t) for t in encoded.tokens[:5] if clean_bpe_token(t)]
    print(f"   Cleaned for TKN: {cleaned_test_tokens}")
    
    return True

def main():
    parser = argparse.ArgumentParser(description="Build BPE tokenizer for TKN server preloading")
    parser.add_argument("--input-file", type=str, help="Input text file (if not provided, downloads TinyStories)")
    parser.add_argument("--vocab-size", type=int, default=2048, help="Vocabulary size (default: 2048)")
    parser.add_argument("--output-dir", type=str, default="./tokenizers", help="Output directory (default: ./tokenizers)")
    parser.add_argument("--max-stories", type=int, default=100000, help="Max stories to download from TinyStories (default: 100k)")
    
    args = parser.parse_args()
    
    print("🚀 Building BPE tokenizer for TKN server symbol table preloading")
    print(f"   Vocabulary size: {args.vocab_size}")
    print(f"   Output directory: {args.output_dir}")
    print("   🔧 Using exact cyrb53 hash and TKN-compatible token format")
    
    success = build_bpe_tokenizer(
        input_file=args.input_file,
        vocab_size=args.vocab_size,
        output_dir=args.output_dir,
        max_stories=args.max_stories
    )
    
    if success:
        print("\n✅ BPE tokenizer built successfully!")
        print(f"   📁 Files created in {args.output_dir}/")
        print(f"   🔧 TKN server will automatically load tkn_bpe_preload_{args.vocab_size}.json on startup")
        print("   ✨ Tokens are now compatible with TKN server processing (no BPE markers)")
    else:
        print("\n❌ Failed to build BPE tokenizer")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main()) 