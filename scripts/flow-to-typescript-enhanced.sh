#!/bin/bash

# Enhanced Flow to TypeScript conversion script
# Usage: ./scripts/flow-to-typescript-enhanced.sh <file.js> [output.ts]

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <input.js> [output.ts]"
    echo "Converts a Flow JavaScript file to TypeScript with enhanced automation"
    exit 1
fi

INPUT_FILE="$1"
if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' does not exist"
    exit 1
fi

# Determine output file and check for JSX content
if [ $# -eq 2 ]; then
    OUTPUT_FILE="$2"
else
    # Check if file contains JSX to determine .tsx vs .ts extension
    if grep -q -E ' from .react.;|React\.|JSX' "$INPUT_FILE"; then
        OUTPUT_FILE="${INPUT_FILE%.js}.tsx"
    else
        OUTPUT_FILE="${INPUT_FILE%.js}.ts"
    fi
fi

echo "🔄 Converting $INPUT_FILE → $OUTPUT_FILE"

# Copy the file first
cp "$INPUT_FILE" "$OUTPUT_FILE"
TEMP_FILE="${OUTPUT_FILE}.tmp"

# Function to apply sed transform with error handling
apply_transform() {
    local pattern="$1"
    local description="$2"
    if ! sed "$pattern" "$OUTPUT_FILE" > "$TEMP_FILE"; then
        echo "⚠️  Warning: Transform failed: $description"
        return 1
    fi
    mv "$TEMP_FILE" "$OUTPUT_FILE"
}

echo "🔧 Applying Flow→TypeScript transformations..."

# 1. Remove @flow directive
apply_transform 's|^// @flow$||g' "Remove @flow directive"

# 2. Convert import type statements (enhanced for more patterns)
apply_transform 's/^import type {/import {/g' "Convert import type (simple)"
apply_transform 's/^import type \([^{].*\) from/import \1 from/g' "Convert import type (default)"

# 3. Convert Flow readonly properties (+prop → readonly prop)
apply_transform 's/+\([a-zA-Z_][a-zA-Z0-9_]*\):/readonly \1:/g' "Convert readonly properties"

# 4. Enhanced nullable type conversion
apply_transform 's/: ?string/: string | null/g' "Convert nullable string"
apply_transform 's/: ?number/: number | null/g' "Convert nullable number"
apply_transform 's/: ?boolean/: boolean | null/g' "Convert nullable boolean"
apply_transform 's/): ?\([A-Za-z][A-Za-z0-9_]*\)/): \1 | null/g' "Convert nullable return types"

# 5. NEW: Handle MixedObject type (common in API code)
apply_transform 's/: MixedObject/: unknown/g' "Convert MixedObject to unknown"
apply_transform 's/<MixedObject>/<unknown>/g' "Convert MixedObject generic"

# 6. NEW: Fix index signature syntax
apply_transform 's/\[string\]:/[key: string]:/g' "Fix index signature syntax"
apply_transform 's/\[number\]:/[key: number]:/g' "Fix numeric index signature"

# 7. NEW: Convert void return types to undefined where appropriate
apply_transform 's/): void/): undefined/g' "Convert void to undefined in return types"

# 8. Enhanced Flow utility types
apply_transform 's/\$Keys<\([^>]*\)>/keyof \1/g' "Convert $Keys"
apply_transform 's/\$ReadOnly<\([^>]*\)>/Readonly<\1>/g' "Convert $ReadOnly"
apply_transform 's/\$Shape<\([^>]*\)>/Partial<\1>/g' "Convert $Shape"
apply_transform 's/: mixed/: unknown/g' "Convert mixed to unknown"

# 9. React type conversions
apply_transform 's/React\.Element</React.ReactElement</g' "Convert React.Element"
apply_transform 's/React\.Node/React.ReactNode/g' "Convert React.Node"
apply_transform 's/SyntheticEvent</React.ChangeEvent</g' "Convert SyntheticEvent"
apply_transform 's/SyntheticMouseEvent</React.MouseEvent</g' "Convert SyntheticMouseEvent"

# 10. NEW: Add explicit parameter types for common patterns
apply_transform 's/= (subject) =>/= (subject: unknown) =>/g' "Add unknown type to subject param"
apply_transform 's/= (item) =>/= (item: unknown) =>/g' "Add unknown type to item param"
apply_transform 's/= (element) =>/= (element: unknown) =>/g' "Add unknown type to element param"

# 11. Clean up
apply_transform '/^$/N;/^\n$/d' "Remove empty lines"

echo "✅ Enhanced conversion complete!"

# NEW: Auto-check for common issues and suggest fixes
echo "🔍 Checking for common issues..."

ISSUES_FOUND=0

# Check for remaining Flow-specific patterns
if grep -q "MixedObject\|mixed\|\$Keys\|\$ReadOnly" "$OUTPUT_FILE" 2>/dev/null; then
    echo "⚠️  Found remaining Flow types that may need manual conversion"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check for missing parameter types
if grep -q "= ([^:)]*) =>" "$OUTPUT_FILE" 2>/dev/null; then
    echo "⚠️  Found arrow functions with potentially untyped parameters"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check for index signatures without key names
if grep -q "\[string\]:\|\[number\]:" "$OUTPUT_FILE" 2>/dev/null; then
    echo "⚠️  Found index signatures that may need key names"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

if [ $ISSUES_FOUND -eq 0 ]; then
    echo "✅ No obvious issues detected"
fi

echo ""
echo "🎯 Recommended next steps:"
echo "   1. yarn typecheck          # Validate TypeScript compilation"
echo "   2. Review/fix any errors   # Address compilation issues" 
echo "   3. yarn test              # Ensure functionality"
echo "   4. rm $INPUT_FILE         # Remove original after validation"