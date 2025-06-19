#!/bin/bash

set -e

# Parse command line arguments
TARGET_DIR="${1:-}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ORIGINAL_DIR="$(pwd)"
CONTEXT_DIR="$ORIGINAL_DIR/.llm-context"

# Determine the target directory and mode
if [ -n "$TARGET_DIR" ]; then
    # Directory mode - use provided directory
    if [ ! -d "$TARGET_DIR" ]; then
        echo "❌ Error: Directory '$TARGET_DIR' does not exist"
        exit 1
    fi
    TARGET_DIR=$(realpath "$TARGET_DIR")
    MODE="directory"
    BASE_NAME=$(basename "$TARGET_DIR")
    COMBINED_FILE="$CONTEXT_DIR/combined_directory_${BASE_NAME}_$TIMESTAMP.txt"
    echo "🤖 Collecting LLM context from directory: $TARGET_DIR"
else
    # Git repository mode (original behavior)
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        echo "❌ Error: Not in a git repository and no directory specified"
        echo "Usage: $0 [directory_path]"
        echo "  If no directory is provided, assumes git repository mode"
        exit 1
    fi
    TARGET_DIR="$(git rev-parse --show-toplevel)"
    MODE="git"
    BASE_NAME=$(basename "$TARGET_DIR")
    COMBINED_FILE="$CONTEXT_DIR/combined_codebase_$TIMESTAMP.txt"
    echo "🤖 Collecting LLM context from git repository: $TARGET_DIR"
fi

# Function to check if file should be ignored
should_ignore_file() {
    local file="$1"
    local filename=$(basename "$file")
    
    # Ignore common lockfiles
    case "$filename" in
        package-lock.json|yarn.lock|pnpm-lock.yaml|Pipfile.lock|poetry.lock|Gemfile.lock|go.sum|Cargo.lock|composer.lock|bun.lock|bun.lockb)
            return 0  # ignore
            ;;
        *)
            return 1  # don't ignore
            ;;
    esac
}

# Function to get files based on mode
get_files() {
    if [ "$MODE" = "git" ]; then
        git ls-files
    else
        # Directory mode - find all files, excluding common patterns
        find "$TARGET_DIR" -type f \
            ! -path "*/.*" \
            ! -path "*/node_modules/*" \
            ! -path "*/venv/*" \
            ! -path "*/__pycache__/*" \
            ! -path "*/build/*" \
            ! -path "*/dist/*" \
            ! -path "*/target/*" \
            ! -path "*/.git/*" \
            | sed "s|^$TARGET_DIR/||"
    fi
}

if [ ! -d "$CONTEXT_DIR" ]; then
    echo "📁 Creating context directory: $CONTEXT_DIR"
    mkdir -p "$CONTEXT_DIR"
fi

echo "📋 Getting list of files..."
cd "$TARGET_DIR"

TOTAL_FILES=$(get_files | wc -l | tr -d ' ')
echo "📊 Found $TOTAL_FILES files to scan"

echo "📝 Creating combined file: $COMBINED_FILE"
echo "# COMBINED CODEBASE CONTEXT" > "$COMBINED_FILE"
echo "# Generated on: $(date)" >> "$COMBINED_FILE"
echo "# Target: $TARGET_DIR" >> "$COMBINED_FILE"
echo "# Mode: $MODE" >> "$COMBINED_FILE"
echo "# Note: Lockfiles are excluded from this context" >> "$COMBINED_FILE"
echo "" >> "$COMBINED_FILE"
echo "================================================================================" >> "$COMBINED_FILE"
echo "" >> "$COMBINED_FILE"

PROCESSED=0
SKIPPED=0

get_files | while IFS= read -r file; do
    if [ ! -f "$file" ]; then
        continue
    fi
    
    # Skip lockfiles
    if should_ignore_file "$file"; then
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    
    # Add file header
    echo "" >> "$COMBINED_FILE"
    echo "################################################################################" >> "$COMBINED_FILE"
    echo "# FILE PATH: $file" >> "$COMBINED_FILE"
    echo "################################################################################" >> "$COMBINED_FILE"
    echo "" >> "$COMBINED_FILE"
    
    # Add file contents
    cat "$file" >> "$COMBINED_FILE"
    
    # Add footer separator
    echo "" >> "$COMBINED_FILE"
    echo "# END OF FILE: $file" >> "$COMBINED_FILE"
    echo "" >> "$COMBINED_FILE"
    
    PROCESSED=$((PROCESSED + 1))
    if [ $((PROCESSED % 50)) -eq 0 ]; then
        echo "⏳ Progress: $PROCESSED files processed, $SKIPPED lockfiles skipped"
    fi
done

echo ""
echo "✅ File collection complete!"
echo "📁 Combined file saved to: $COMBINED_FILE"
echo "📊 Files processed: $PROCESSED"
echo "🚫 Lockfiles skipped: $SKIPPED"

COMBINED_SIZE=$(du -h "$COMBINED_FILE" | cut -f1)
echo "📏 Combined file size: $COMBINED_SIZE"

echo ""
echo "🎉 LLM context collection complete!"
echo ""
echo "💡 Usage tips:"
echo "   • Usage: $0 [directory_path]"
echo "   • If no directory provided, operates on current git repository"
echo "   • Combined file contains all relevant files in one document"
echo "   • Lockfiles and common build artifacts are automatically excluded"
echo "   • Each file is clearly marked with its original path"
echo "   • File separators make it easy to identify individual files"
echo "   • Upload $COMBINED_FILE to your LLM for codebase analysis" 