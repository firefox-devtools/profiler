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

# Determine output file and check for JSX content
if [ $# -eq 2 ]; then
    OUTPUT_FILE="$2"
else
    # Check if file contains JSX to determine .tsx vs .ts extension
    if grep -q -E ' from .react.;' "$INPUT_FILE"; then
        OUTPUT_FILE="${INPUT_FILE%.js}.tsx"
    else
        OUTPUT_FILE="${INPUT_FILE%.js}.ts"
    fi
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
# Handle common primitive types and simple patterns
sed 's/: ?string/: string | null/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/: ?number/: number | null/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/: ?boolean/: boolean | null/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
# Handle function return types: ): ?Type → ): Type | null
sed 's/): ?\([A-Za-z][A-Za-z0-9_]*\)/): \1 | null/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 5. Convert Flow type annotations in various contexts
# (value: Type) → value as Type - in return statements
sed 's/return (\([^:)]*\): \([^)]*\));/return \1 as \2;/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
# "any" type annotation: `: any)` → ` as any)`
sed 's/: any)/ as any)/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
# "empty" type annotation: `: empty)` → ` as never)`
sed 's/: empty)/ as never)/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 6. Convert common Flow utility types
sed 's/\$Keys<\([^>]*\)>/keyof \1/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/\$ReadOnly<\([^>]*\)>/Readonly<\1>/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/\$ReadOnlyArray<\([^>]*\)>/ReadonlyArray<\1>/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/\$Shape<\([^>]*\)>/Partial<\1>/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/: mixed/: unknown/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 7. Convert React types
sed 's/React\.Element</React.ReactElement</g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 8. Convert Flow object type casting ({}: Type → {} as Type)
sed 's/({}:  *\([^)]*\))/({} as \1)/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 9. Convert React event types (encountered in LanguageSwitcher.tsx)
sed 's/SyntheticEvent</React.ChangeEvent</g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/SyntheticMouseEvent</React.MouseEvent</g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"
sed 's/SyntheticKeyboardEvent</React.KeyboardEvent</g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 10. Convert React.Node to React.ReactNode (React 18 compatibility)
sed 's/React\.Node/React.ReactNode/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 11. Fix type object syntax (encountered in profile-metainfo.ts and TrackEventDelayGraph.tsx)
# Convert type object properties from Flow comma syntax to TypeScript semicolon syntax
# This is complex and may need manual review for multiline cases
sed 's/readonly \([a-zA-Z_][a-zA-Z0-9_]*\): \([^,}]*\),$/readonly \1: \2;/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 12. Convert Flow spread types to TypeScript intersection types
# Note: This is a simple case - complex spreads need manual review
sed 's/type \([A-Za-z][A-Za-z0-9_]*\) = {\(.*\)\.\.\.\([A-Za-z][A-Za-z0-9_]*\),\(.*\)};/type \1 = \3 \& {\2\4};/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# 13. Remove trailing commas from generic type parameters (TypeScript doesn't allow them)
# Pattern: <Type1, Type2, Type3,> → <Type1, Type2, Type3>
sed 's/,\([[:space:]]*\)>/\1>/g' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

# Clean up any empty lines created by removing @flow
sed '/^$/N;/^\n$/d' "$OUTPUT_FILE" > "$TEMP_FILE" && mv "$TEMP_FILE" "$OUTPUT_FILE"

echo "✅ Enhanced Flow→TypeScript conversion complete!"
echo "✅ Automatically handled:"
echo "   - React event types (SyntheticEvent → React.ChangeEvent)"
echo "   - React.Node → React.ReactNode compatibility"
echo "   - Type object property syntax (comma → semicolon)"
echo "   - Flow spread types → TypeScript intersection types (simple cases)"
echo "   - Generic type parameter trailing commas removal"
echo ""
echo "⚠️  Manual review still required for:"
echo "   - Complex multiline type definitions"
echo "   - Generic constructor types (new Set() → new Set<T>())"  
echo "   - React component overrides (add 'override' keyword)"
echo "   - Function parameter types (add explicit parameter names)"
echo "   - MarkerPayload property access (may need 'as any' casts)"
echo "   - Complex spread type patterns (...Props in multiline types)"
echo "   - State type annotations (state = {} → state: State = {})"
echo ""
echo "🔧 Next steps:"
echo "   1. Run 'yarn typecheck' to validate"
echo "   2. Review and fix any remaining type issues"
echo "   3. Run 'yarn test' to ensure functionality"
echo "   4. Remove original .js file after validation"