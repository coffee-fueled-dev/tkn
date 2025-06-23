#!/usr/bin/env python3
"""
Build a BPE tokenizer from any text input for preloading the TKN server symbol table.
Processes any provided text file to create BPE tokens compatible with TKN.
"""

import os
import json
import argparse
import struct
from typing import Dict, List, Any, Optional, Union
from pathlib import Path

# Hash computation will be handled by the server using actual TknMiner logic

def clean_bpe_token(token: str) -> str:
    """
    No cleaning needed - tokens are generated without special tokens or markers.
    """
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
    
    # Initialize a tokenizer with BPE model (no special tokens for TKN)
    tokenizer = Tokenizer(BPE())
    
    # Set up the trainer
    trainer = BpeTrainer(
        vocab_size=vocab_size,
        special_tokens=[],  # No special tokens needed for TKN
        min_frequency=2,
        continuing_subword_prefix="",
        end_of_word_suffix="",  # No end-of-word markers
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

def validate_input_file(input_file: str) -> bool:
    """Validate that the input file exists and is readable."""
    if not os.path.exists(input_file):
        print(f"❌ Input file not found: {input_file}")
        return False
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            # Try to read first few lines to validate
            for i, line in enumerate(f):
                if i >= 10:  # Check first 10 lines
                    break
                if not line.strip():
                    continue
                # Basic validation - ensure it's text
                if len(line.strip()) > 0:
                    break
            else:
                print(f"⚠️  Warning: Input file appears to be empty or contains no readable text")
                return False
    except Exception as e:
        print(f"❌ Error reading input file: {e}")
        return False
    
    file_size = os.path.getsize(input_file)
    print(f"✅ Input file validated: {input_file} ({file_size:,} bytes)")
    return True

def build_bpe_tokenizer(
    input_file: str,
    vocab_size: int = 2048,
    output_dir: str = "./tokenizers"
) -> bool:
    """Build BPE tokenizer and create preload files for TKN server."""
    
    # Validate input file
    if not validate_input_file(input_file):
        return False
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"📖 Processing text file: {input_file}")
    text_file = input_file
    
    # Create BPE tokenizer
    tokenizer = create_proper_bpe_tokenizer(text_file, vocab_size)
    if not tokenizer:
        return False
    
    # Get vocabulary
    vocab = tokenizer.get_vocab()
    print(f"📊 Vocabulary size: {len(vocab)} tokens")
    
    # Create simple token list for server-side processing
    token_list = []
    
    # Process each token for TKN compatibility
    for token, token_id in vocab.items():
        cleaned_token = clean_bpe_token(token)
            
        # Store simple token data - server will handle hashing
        token_list.append({
            "value": cleaned_token,
            "token_id": token_id,
        })
    
    # Save preload file (use /tmp first, then copy to target)
    temp_preload_file = f"/tmp/tkn_bpe_preload_{vocab_size}.json"
    preload_file = os.path.join(output_dir, f"tkn_bpe_preload_{vocab_size}.json")
    
    with open(temp_preload_file, "w", encoding="utf-8") as f:
        json.dump(token_list, f, indent=2, ensure_ascii=False)
    
    # Copy from temp to final location
    import shutil
    shutil.copy2(temp_preload_file, preload_file)
    
    print(f"💾 Saved TKN preload file to {preload_file}")
    print(f"📈 Preload contains {len(token_list)} raw tokens for server processing")
    
    # Show some example tokens
    print("\n🔍 Sample cleaned tokens for TKN server:")
    sample_tokens = token_list[:10]
    for token_data in sample_tokens:
        token = token_data["value"]
        print(f"   '{token}' (id: {token_data['token_id']})")
    
    # Test tokenization with cleaned tokens
    test_text = "Once upon a time, there was a little girl."
    encoded = tokenizer.encode(test_text)
    print(f"\n🧪 Test tokenization:")
    print(f"   Input: '{test_text}'")
    print(f"   BPE tokens: {encoded.tokens[:8]}...")  # Show first 8 tokens
    
    # Show tokens ready for TKN (no processing needed)
    tkn_ready_tokens = [clean_bpe_token(t) for t in encoded.tokens[:5]]
    print(f"   TKN-ready tokens: {tkn_ready_tokens}")
    
    return True

def main():
    parser = argparse.ArgumentParser(description="Build BPE tokenizer for TKN server preloading")
    parser.add_argument("input_file", type=str, help="Input text file to process")
    parser.add_argument("--vocab-size", type=int, default=2048, help="Vocabulary size (default: 2048)")
    parser.add_argument("--output-dir", type=str, default="./tokenizers", help="Output directory (default: ./tokenizers)")
    
    args = parser.parse_args()
    
    print("🚀 Building BPE tokenizer for TKN server symbol table preloading")
    print(f"   Input file: {args.input_file}")
    print(f"   Vocabulary size: {args.vocab_size}")
    print(f"   Output directory: {args.output_dir}")
    
    success = build_bpe_tokenizer(
        input_file=args.input_file,
        vocab_size=args.vocab_size,
        output_dir=args.output_dir
    )
    
    if success:
        print("\n✅ BPE tokenizer built successfully!")
        print(f"   📁 Vocab file created in {args.output_dir}/")
        print(f"   🔧 TKN server will automatically load tkn_bpe_preload_{args.vocab_size}.json on startup")
        print("   ✨ Tokens generated without BPE markers for TKN compatibility")
    else:
        print("\n❌ Failed to build BPE tokenizer")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main()) 