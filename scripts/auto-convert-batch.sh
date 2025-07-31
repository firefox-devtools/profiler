#!/bin/bash

# Automated batch conversion script for TypeScript migration
# Converts multiple files and validates each one

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Automated TypeScript batch conversion"
echo "========================================"

# Get list of files with 0 JS dependencies and < 200 lines (good candidates)
CANDIDATES=$(./scripts/analyze-dependencies.sh | grep "🟢 0 deps" | awk -F: '{if ($2 < 200 && $2 > 0) print $3}' | head -5)

if [ -z "$CANDIDATES" ]; then
    echo "❌ No good candidates found for batch conversion"
    exit 1
fi

echo "📋 Found candidates for conversion:"
echo "$CANDIDATES"
echo ""

CONVERTED=0
FAILED=0

for file in $CANDIDATES; do
    if [ ! -f "$file" ]; then
        continue
    fi
    
    echo "🔄 Converting: $file"
    
    # Try conversion
    if ./scripts/flow-to-typescript-enhanced.sh "$file"; then
        # Get the output file name
        if [[ "$file" == *"react"* ]] || grep -q "React\|JSX" "$file" 2>/dev/null; then
            output_file="${file%.js}.tsx"
        else
            output_file="${file%.js}.ts"
        fi
        
        echo "  ✅ Conversion completed: $output_file"
        
        # Test compilation
        echo "  🔍 Testing compilation..."
        if yarn typecheck > /dev/null 2>&1; then
            echo -e "  ${GREEN}✅ TypeScript compilation passed${NC}"
            
            # Run tests
            echo "  🧪 Running tests..."
            if yarn test > /dev/null 2>&1; then
                echo -e "  ${GREEN}✅ Tests passed${NC}"
                
                # Remove original file
                rm "$file"
                echo -e "  ${GREEN}✅ Removed original file${NC}"
                
                # Format with prettier
                yarn prettier-fix > /dev/null 2>&1
                
                CONVERTED=$((CONVERTED + 1))
                echo -e "  ${GREEN}🎉 Successfully converted $file${NC}"
            else
                echo -e "  ${RED}❌ Tests failed${NC}"
                # Revert the conversion
                mv "$output_file" "$file"
                FAILED=$((FAILED + 1))
            fi
        else
            echo -e "  ${RED}❌ TypeScript compilation failed${NC}"
            # Revert the conversion  
            mv "$output_file" "$file"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "  ${RED}❌ Conversion script failed${NC}"
        FAILED=$((FAILED + 1))
    fi
    
    echo ""
done

echo "📊 Batch conversion summary:"
echo "   ✅ Successfully converted: $CONVERTED files"
echo "   ❌ Failed conversions: $FAILED files"

if [ $CONVERTED -gt 0 ]; then
    echo ""
    echo "🎯 Next steps:"
    echo "   1. Review converted files for any manual fixes needed"
    echo "   2. Commit the successful conversions"
    echo "   3. Run this script again for the next batch"
fi