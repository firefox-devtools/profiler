#!/bin/bash

# Dependency analysis script for TypeScript migration
# Helps identify files with minimal dependencies for optimal conversion order

set -e

echo "🔍 Analyzing JavaScript files and their TypeScript dependencies..."

# Find all .js files (excluding tests and node_modules)
JS_FILES=$(find src -name "*.js" -not -path "*/test/*" -not -path "*/node_modules/*" | sort)

echo "📊 JavaScript files remaining for conversion:"
echo "$JS_FILES" | wc -l | tr -d ' '
echo ""

# Function to count TypeScript imports in a file
count_ts_dependencies() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo 0
        return
    fi
    
    # Count import statements that reference files without explicit .ts/.tsx extension
    # These likely point to .js files that haven't been converted yet
    local total_imports=$(grep -c "from.*['\"]" "$file" 2>/dev/null || echo 0)
    local ts_imports=$(grep -c "from.*\.\(ts\|tsx\)['\"]" "$file" 2>/dev/null || echo 0)
    echo $((total_imports - ts_imports))
}

# Function to analyze a single file
analyze_file() {
    local file="$1"
    local js_deps=$(count_ts_dependencies "$file")
    local line_count=$(wc -l < "$file" 2>/dev/null || echo 0)
    
    echo "$js_deps:$line_count:$file"
}

echo "🎯 Files ranked by conversion priority (JS deps : lines : file):"
echo "   Priority: Fewer JS dependencies = easier to convert first"
echo ""

# Analyze all files and sort by dependency count, then by size
for file in $JS_FILES; do
    analyze_file "$file"
done | sort -t: -k1,1n -k2,2n | while IFS=: read deps lines filepath; do
    if [ "$deps" -eq 0 ]; then
        echo "🟢 $deps deps, $lines lines: $filepath"  # No JS dependencies - ready to convert
    elif [ "$deps" -le 2 ]; then
        echo "🟡 $deps deps, $lines lines: $filepath"  # Few dependencies
    else
        echo "🔴 $deps deps, $lines lines: $filepath"  # Many dependencies - convert later
    fi
done

echo ""
echo "🚀 Recommended conversion strategy:"
echo "   1. Convert 🟢 files first (no JS dependencies)"
echo "   2. Then convert 🟡 files (few dependencies)"  
echo "   3. Save 🔴 files for last (many dependencies)"
echo ""
echo "💡 Tip: Convert smaller files within each category first for easier testing"