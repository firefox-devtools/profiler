#!/bin/bash

# Flow to TypeScript conversion script
# Usage: ./scripts/flow-to-typescript.sh <file.js> [output.ts]
# If no output file is specified, creates <basename>.ts

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <input.js> [output.ts]"
    echo "Converts a Flow JavaScript file to TypeScript"
    exit 1
fi

INPUT_FILE="$1"
if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' does not exist"
    exit 1
fi

# Determine output file
if [ $# -eq 2 ]; then
    OUTPUT_FILE="$2"
else
    # Replace .js with .ts, keeping the directory
    OUTPUT_FILE="${INPUT_FILE%.js}.ts"
fi

echo "Converting $INPUT_FILE → $OUTPUT_FILE"

# Copy the file first
cp "$INPUT_FILE" "$OUTPUT_FILE"

# Apply Flow→TypeScript transformations using sed
# Create temp file for cross-platform compatibility
TEMP_FILE="${OUTPUT_FILE}.tmp"

# 1. Remove @flow directive
sed 's|^// @flow$||g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 2. Convert import type statements
# This handles multiline import type statements by processing line by line
# For simple single-line cases:
sed 's/^import type {/import {/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/^import type \([^{].*\) from/import \1 from/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 3. Convert Flow readonly properties (+prop → readonly prop)
# This is more complex due to potential multiline type definitions
# We'll handle simple cases - complex ones may need manual review
sed 's/+\([a-zA-Z_][a-zA-Z0-9_]*\):/readonly \1:/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 4. Convert Flow nullable types (?Type → Type | null)
# This is tricky because ?string could be in various contexts
# We'll handle common patterns - complex cases need manual review
sed 's/: ?string/: string | null/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/: ?number/: number | null/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/: ?boolean/: boolean | null/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 5. Convert Flow type annotations ((value: Type) → value as Type)
# This regex looks for (variable: Type) patterns at the end of return statements
sed 's/return (\([^:)]*\): \([^)]*\));/return \1 as \2;/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 6. Convert common Flow utility types
sed 's/\$Keys<\([^>]*\)>/keyof \1/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/\$ReadOnly<\([^>]*\)>/Readonly<\1>/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/\$Shape<\([^>]*\)>/Partial<\1>/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/: mixed/: unknown/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 7. Convert Flow object type casting ({}: Type → {} as Type)
sed 's/({}:  *\([^)]*\))/({} as \1)/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# Clean up any empty lines created by removing @flow
sed '/^$/N;/^\n$/d' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

echo "✅ Basic Flow→TypeScript conversion complete!"
echo "⚠️  Manual review required for:"
echo "   - Complex multiline type definitions"
echo "   - Generic constructor types (new Set() → new Set<T>())"
echo "   - React component overrides (add 'override' keyword)"
echo "   - Complex nullable types beyond string/number/boolean"
echo "   - Trailing commas in type definitions"
echo ""
echo "🔧 Next steps:"
echo "   1. Review and fix any remaining type issues"
echo "   2. Run 'yarn typecheck' to validate"
echo "   3. Run 'yarn test' to ensure functionality"
echo "   4. Remove original .js file after validation"