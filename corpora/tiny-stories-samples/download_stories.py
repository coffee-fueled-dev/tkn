#!/usr/bin/env python3
"""
Download TinyStories and emit a requested number of stories to a file.
Useful for creating test corpora of different sizes.
"""

import os
import argparse
from pathlib import Path
from typing import Optional

def download_tinystories(
    num_stories: int,
    output_file: str,
    start_index: int = 0,
    clean_text: bool = True
) -> bool:
    """Download TinyStories and save to file."""
    
    try:
        from datasets import load_dataset
        import gc
        import threading
        import time
    except ImportError:
        print("❌ 'datasets' library not found.")
        print("   Install with: pip install datasets")
        return False
    
    print(f"📥 Downloading {num_stories:,} TinyStories...")
    print(f"   Starting from index: {start_index:,}")
    print(f"   Output file: {output_file}")
    
    dataset = None
    try:
        # Load dataset in streaming mode for efficiency
        dataset = load_dataset("roneneldan/TinyStories", split="train", streaming=True)
        
        stories_written = 0
        stories_processed = 0
        
        with open(output_file, "w", encoding="utf-8") as f:
            for i, example in enumerate(dataset):
                # Skip to start index
                if i < start_index:
                    continue
                
                stories_processed += 1
                
                # Get story text
                text = example["text"]
                
                if clean_text:
                    # Basic cleaning
                    text = text.strip()
                    if not text:  # Skip empty stories
                        continue
                    
                    # Remove excessive whitespace
                    text = " ".join(text.split())
                
                # Write story
                f.write(text)
                f.write("\n\n")  # Double newline between stories
                
                stories_written += 1
                
                # Progress updates
                if stories_written % 1000 == 0:
                    print(f"   📝 Written {stories_written:,} stories...")
                
                # Stop when we have enough stories
                if stories_written >= num_stories:
                    break
        
        file_size = os.path.getsize(output_file)
        print(f"✅ Download complete!")
        print(f"   📊 Stories written: {stories_written:,}")
        print(f"   📊 Stories processed: {stories_processed:,}")
        print(f"   📁 File size: {file_size:,} bytes ({file_size / 1024 / 1024:.2f} MB)")
        
        return True
        
    except Exception as e:
        print(f"❌ Error downloading TinyStories: {e}")
        return False
    finally:
        # Aggressive cleanup
        if dataset is not None:
            try:
                del dataset
            except:
                pass
        
        # Force garbage collection
        try:
            gc.collect()
        except:
            pass
        
        # Give a moment for cleanup, then force exit
        try:
            time.sleep(0.1)
        except:
            pass

def estimate_file_size(num_stories: int) -> str:
    """Estimate the output file size based on number of stories."""
    # Average TinyStory is about 300-400 characters
    avg_chars_per_story = 350
    estimated_bytes = num_stories * avg_chars_per_story
    estimated_mb = estimated_bytes / 1024 / 1024
    
    if estimated_mb < 1:
        return f"~{estimated_bytes / 1024:.1f} KB"
    else:
        return f"~{estimated_mb:.1f} MB"

def main():
    parser = argparse.ArgumentParser(
        description="Download TinyStories and emit to file",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Download 1000 stories to small sample (saved to output/small_sample.txt)
  python3 download_stories.py 1000 -o small_sample.txt
  
  # Download 50k stories to medium sample (saved to output/medium_sample.txt)
  python3 download_stories.py 50000 -o medium_sample.txt
  
  # Download stories starting from index 10000
  python3 download_stories.py 5000 -o offset_sample.txt --start-index 10000
  
  # Download without text cleaning
  python3 download_stories.py 1000 -o raw_sample.txt --no-clean
  
  # Download to specific path (outside output directory)
  python3 download_stories.py 1000 -o ../custom_location.txt
        """
    )
    
    parser.add_argument(
        "num_stories", 
        type=int, 
        help="Number of stories to download"
    )
    parser.add_argument(
        "-o", "--output", 
        type=str, 
        help="Output filename (default: tinystories_<num>_stories.txt in output/ directory)"
    )
    parser.add_argument(
        "--start-index", 
        type=int, 
        default=0,
        help="Starting index in dataset (default: 0)"
    )
    parser.add_argument(
        "--no-clean", 
        action="store_true",
        help="Skip text cleaning (keep original formatting)"
    )
    
    args = parser.parse_args()
    
    # Validate arguments
    if args.num_stories <= 0:
        print("❌ Number of stories must be positive")
        return 1
    
    if args.start_index < 0:
        print("❌ Start index must be non-negative")
        return 1
    
    # Generate output filename if not provided
    if args.output:
        output_file = args.output
    else:
        output_file = f"tinystories_{args.num_stories}_stories.txt"
    
    # Ensure we're in the right directory and create output directory
    script_dir = Path(__file__).parent
    output_dir = script_dir / "output"
    output_dir.mkdir(exist_ok=True)
    
    # If output_file is just a filename (no path), put it in output directory
    if "/" not in output_file and "\\" not in output_file:
        output_path = output_dir / output_file
    else:
        # User specified a path, respect it
        output_path = script_dir / output_file
    
    print("🚀 TinyStories Downloader")
    print("=" * 40)
    print(f"📊 Stories to download: {args.num_stories:,}")
    print(f"📁 Output file: {output_path}")
    print(f"📏 Estimated size: {estimate_file_size(args.num_stories)}")
    print(f"🧹 Text cleaning: {'disabled' if args.no_clean else 'enabled'}")
    
    # Check if file already exists
    if output_path.exists():
        response = input(f"\n⚠️  File '{output_file}' already exists. Overwrite? (y/N): ")
        if response.lower() not in ['y', 'yes']:
            print("❌ Cancelled")
            return 0
    
    # Download stories
    success = download_tinystories(
        num_stories=args.num_stories,
        output_file=str(output_path),
        start_index=args.start_index,
        clean_text=not args.no_clean
    )
    
    if success:
        print(f"\n🎉 Successfully created {output_file}")
        print(f"💡 Use this file with: bun run corpus:bpe {output_file}")
        return 0
    else:
        print(f"\n❌ Failed to create {output_file}")
        return 1

if __name__ == "__main__":
    import sys
    import os
    import signal
    import threading
    import time
    
    def timeout_handler():
        """Force exit after a timeout to prevent hanging."""
        time.sleep(5)  # Wait 5 seconds after main completes
        print("\n⚠️  Forcing exit to prevent hanging...")
        os._exit(0)
    
    def signal_handler(signum, frame):
        """Handle interrupt signals."""
        print("\n\n⚠️  Download interrupted by user")
        os._exit(1)
    
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        exit_code = main()
        
        # Start timeout thread to force exit
        timeout_thread = threading.Thread(target=timeout_handler, daemon=True)
        timeout_thread.start()
        
        print("\n🔄 Cleaning up resources...")
        
        # Force exit to avoid hanging on dataset cleanup
        os._exit(exit_code)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Download interrupted by user")
        os._exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        os._exit(1) 