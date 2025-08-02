#!/bin/bash

# Unified Flow to TypeScript conversion script
# Combines best features from previous scripts + lessons learned from active conversion
# Usage: ./scripts/flow-to-typescript-unified.sh <file.js> [output.ts]

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <input.js> [output.ts]"
    echo "Converts a Flow JavaScript file to TypeScript with comprehensive automation"
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

echo "🔄 Converting $INPUT_FILE → $OUTPUT_FILE"

# Copy the file first
cp "$INPUT_FILE" "$OUTPUT_FILE"
TEMP_FILE="${OUTPUT_FILE}.tmp"

# Function to apply sed transform with error handling
apply_transform() {
    local pattern="$1"
    local description="$2"
    if ! sed "$pattern" "$OUTPUT_FILE" > "$TEMP_FILE" 2>/dev/null; then
        echo "⚠️  Warning: Transform failed: $description"
        return 1
    fi
    mv "$TEMP_FILE" "$OUTPUT_FILE"
    return 0
}

echo "🔧 Applying Flow→TypeScript transformations..."

# 1. Remove @flow directive
apply_transform 's|^// @flow$||g' "Remove @flow directive"

# 2. Convert import type statements
apply_transform 's/^import type {/import {/g' "Convert import type (object imports)"
apply_transform 's/^import type \([^{].*\) from/import \1 from/g' "Convert import type (default imports)"

# 3. CRITICAL: Convert function types without parameter names (fixes TS1005/TS1109)
# This is the most important fix discovered during conversion
# Only add parameter names when there are actual parameters (not empty parens)
apply_transform 's/Selector<(\([^)][^)]*\)) =>/Selector<(actionOrActionList: \1) =>/g' "Add parameter names to Selector function types"
apply_transform 's/: (\([^)][^)]*\)) =>/: (param: \1) =>/g' "Add parameter names to generic function types"

# Specifically handle common Flow type patterns that need parameter names
apply_transform 's/: (Action | Action\[\]/: (actionOrActionList: Action | Action[]/g' "Fix Action union parameter names"
# Remove the problematic string-based pattern that was too broad
# apply_transform 's/: (string[^)]*) =>/: (param: \1) =>/g' "Add parameter names to string-based function types"

# 4. Convert Flow nullable types (?Type → Type | null)
apply_transform 's/: ?\([A-Za-z][A-Za-z0-9_]*\)/: \1 | null/g' "Convert nullable types"
apply_transform 's/): ?\([A-Za-z][A-Za-z0-9_]*\)/): \1 | null/g' "Convert nullable return types"

# 5. Convert Flow readonly properties (+prop → readonly prop)
apply_transform 's/+\([a-zA-Z_][a-zA-Z0-9_]*\):/readonly \1:/g' "Convert readonly properties"

# Also handle readonly properties with optional syntax (+prop?:)
apply_transform 's/+\([a-zA-Z_][a-zA-Z0-9_]*\)?:/readonly \1?:/g' "Convert optional readonly properties"

# 6. Fix trailing commas in multiline type definitions (TypeScript strict requirement)
# Handle simple case first
apply_transform 's/,\([[:space:]]*\)>/\1>/g' "Remove trailing commas from generic types"

# Handle multiline case: comma followed by newline, whitespace, and closing bracket
# Use perl for proper multiline regex handling
if command -v perl >/dev/null 2>&1; then
    perl -0777 -i -pe 's/,(\s*\n\s*>)/\1/g' "$OUTPUT_FILE" && echo "Applied multiline trailing comma removal" || echo "⚠️  Perl multiline fix failed"
else
    # Fallback using sed (less reliable for multiline)
    apply_transform ':a;N;$!ba;s/,\([[:space:]]*\n[[:space:]]*\)>/\1>/g' "Remove multiline trailing commas (sed fallback)"
fi

# 7. Convert Flow utility types
apply_transform 's/\$Keys<\([^>]*\)>/keyof \1/g' "Convert $Keys to keyof"
apply_transform 's/\$ReadOnly<\([^>]*\)>/Readonly<\1>/g' "Convert $ReadOnly to Readonly"
apply_transform 's/\$ReadOnlyArray<\([^>]*\)>/ReadonlyArray<\1>/g' "Convert $ReadOnlyArray"
apply_transform 's/\$Shape<\([^>]*\)>/Partial<\1>/g' "Convert $Shape to Partial"
apply_transform 's/: mixed/: unknown/g' "Convert mixed to unknown"
apply_transform 's/: MixedObject/: unknown/g' "Convert MixedObject to unknown"

# Convert Flow built-in types to TypeScript equivalents
apply_transform 's/: TimeoutID/: NodeJS.Timeout/g' "Convert TimeoutID to NodeJS.Timeout"
apply_transform 's/TimeoutID/NodeJS.Timeout/g' "Convert TimeoutID type references"
apply_transform 's/: IntervalID/: NodeJS.Timeout/g' "Convert IntervalID to NodeJS.Timeout"

# Convert HTML boolean attributes to React boolean props
apply_transform 's/required="required"/required={true}/g' "Convert required attribute"
apply_transform 's/disabled="disabled"/disabled={true}/g' "Convert disabled attribute"
apply_transform 's/checked="checked"/checked={true}/g' "Convert checked attribute"
apply_transform 's/selected="selected"/selected={true}/g' "Convert selected attribute"
apply_transform 's/multiple="multiple"/multiple={true}/g' "Convert multiple attribute"
apply_transform 's/readonly="readonly"/readOnly={true}/g' "Convert readonly attribute (note: readOnly in React)"

# 8. Fix index signatures (require key names in TypeScript)
apply_transform 's/\[string\]:/[key: string]:/g' "Fix string index signatures"
apply_transform 's/\[number\]:/[key: number]:/g' "Fix number index signatures"

# 9. Convert React types
apply_transform 's/React\.Element</React.ReactElement</g' "Convert React.Element"
apply_transform 's/React\.Node/React.ReactNode/g' "Convert React.Node"
apply_transform 's/SyntheticEvent</React.ChangeEvent</g' "Convert SyntheticEvent"
apply_transform 's/SyntheticMouseEvent</React.MouseEvent</g' "Convert SyntheticMouseEvent"
apply_transform 's/SyntheticKeyboardEvent</React.KeyboardEvent</g' "Convert SyntheticKeyboardEvent"
apply_transform 's/SyntheticFocusEvent</React.FocusEvent</g' "Convert SyntheticFocusEvent"
apply_transform 's/SyntheticEvent<HTMLFormElement>/React.FormEvent<HTMLFormElement>/g' "Convert SyntheticEvent with form elements"

# 9a. Add React component override modifiers (critical for TypeScript compilation)
# Add override to class state properties
apply_transform 's/^  state = {/  override state = {/g' "Add override to class state"
apply_transform 's/^    state = {/    override state = {/g' "Add override to class state (4-space indent)"

# Add override to React lifecycle methods
apply_transform 's/^  componentDidMount(/  override componentDidMount(/g' "Add override to componentDidMount"
apply_transform 's/^  componentDidUpdate(/  override componentDidUpdate(/g' "Add override to componentDidUpdate"
apply_transform 's/^  componentWillUnmount(/  override componentWillUnmount(/g' "Add override to componentWillUnmount"
apply_transform 's/^  componentDidCatch(/  override componentDidCatch(/g' "Add override to componentDidCatch"
apply_transform 's/^  getSnapshotBeforeUpdate(/  override getSnapshotBeforeUpdate(/g' "Add override to getSnapshotBeforeUpdate"

# Add override to render method
apply_transform 's/^  render(/  override render(/g' "Add override to render method"

# Handle 4-space indentation as well
apply_transform 's/^    componentDidMount(/    override componentDidMount(/g' "Add override to componentDidMount (4-space)"
apply_transform 's/^    componentDidUpdate(/    override componentDidUpdate(/g' "Add override to componentDidUpdate (4-space)"
apply_transform 's/^    componentWillUnmount(/    override componentWillUnmount(/g' "Add override to componentWillUnmount (4-space)"
apply_transform 's/^    componentDidCatch(/    override componentDidCatch(/g' "Add override to componentDidCatch (4-space)"
apply_transform 's/^    getSnapshotBeforeUpdate(/    override getSnapshotBeforeUpdate(/g' "Add override to getSnapshotBeforeUpdate (4-space)"
apply_transform 's/^    render(/    override render(/g' "Add override to render method (4-space)"

# 10. Convert Flow type annotations in various contexts
apply_transform 's/return (\([^:)]*\): \([^)]*\));/return \1 as \2;/g' "Convert return type annotations"
apply_transform 's/: any)/ as any)/g' "Convert any type annotations"
apply_transform 's/: empty)/ as never)/g' "Convert empty type annotations"

# 11. Convert Flow object type casting
apply_transform 's/({}:  *\([^)]*\))/({} as \1)/g' "Convert object type casting"

# 12. Type object property syntax (comma → semicolon) - DISABLED
# NOTE: These transformations were causing issues by converting commas to semicolons 
# in regular JavaScript object literals, not just TypeScript type definitions.
# Manual conversion is safer for these cases.
# 
# TODO: Implement smarter logic to only target actual type definitions:
# - Line starts with whitespace + property name + colon (likely type definition)
# - Avoid lines with = assignments (likely object literals)
# - Context-aware parsing to distinguish type vs value contexts
#
# For now, these conversions should be done manually during review.

# 13. Convert void return types to undefined where appropriate
apply_transform 's/): void$/): undefined/g' "Convert void to undefined in return types"

# 14. Add explicit parameter types for common patterns (prevents implicit any)
apply_transform 's/= (subject) =>/= (subject: unknown) =>/g' "Add types to subject parameters"
apply_transform 's/= (item) =>/= (item: unknown) =>/g' "Add types to item parameters"
apply_transform 's/= (element) =>/= (element: unknown) =>/g' "Add types to element parameters"

# 15. Clean up empty lines created by removing @flow
apply_transform '/^$/N;/^\n$/d' "Remove empty lines"

echo "✅ Unified Flow→TypeScript conversion complete!"

# Auto-check for remaining issues
echo "🔍 Checking for remaining issues..."

ISSUES_FOUND=0
WARNINGS=()

# Check for remaining Flow-specific patterns
if grep -q "MixedObject\|mixed\|\$Keys\|\$ReadOnly" "$OUTPUT_FILE" 2>/dev/null; then
    WARNINGS+=("Found remaining Flow types that may need manual conversion")
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check for function types without parameter names (the critical issue)
if grep -q "Selector<([^:)]*) =>" "$OUTPUT_FILE" 2>/dev/null; then
    WARNINGS+=("CRITICAL: Found function types without parameter names (will cause TS1005/TS1109)")
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check for missing parameter types
if grep -q "= ([^:)]*) =>" "$OUTPUT_FILE" 2>/dev/null; then
    WARNINGS+=("Found arrow functions with potentially untyped parameters")
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check for new Set() without type parameters
if grep -q "new Set()" "$OUTPUT_FILE" 2>/dev/null; then
    WARNINGS+=("Found Set constructors without type parameters")
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check for literal types that may need 'as const'
if grep -q "type: '[^']*'" "$OUTPUT_FILE" 2>/dev/null; then
    WARNINGS+=("Found literal types that may need 'as const' for proper inference")
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check for remaining trailing commas in type definitions
if grep -q -E ',\s*>' "$OUTPUT_FILE" 2>/dev/null; then
    WARNINGS+=("Found remaining trailing commas in type definitions")
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check for React components that might need override (should be fixed automatically now)
if grep -q "class.*extends.*Component" "$OUTPUT_FILE" 2>/dev/null; then
    if grep -q "render(" "$OUTPUT_FILE" 2>/dev/null && ! grep -q "override render(" "$OUTPUT_FILE" 2>/dev/null; then
        WARNINGS+=("Found React component render method without override (should be fixed automatically)")
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

# Check for old HTML boolean attributes (should be fixed automatically now)
if grep -q 'required="required"\|disabled="disabled"\|checked="checked"' "$OUTPUT_FILE" 2>/dev/null; then
    WARNINGS+=("Found HTML boolean attributes that should be React boolean props (should be fixed automatically)")
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

if [ $ISSUES_FOUND -eq 0 ]; then
    echo "✅ No obvious issues detected - ready for compilation!"
else
    echo "⚠️  Found $ISSUES_FOUND potential issues:"
    for warning in "${WARNINGS[@]}"; do
        echo "   - $warning"
    done
fi

echo ""
echo "🎯 Next steps:"
echo "   1. yarn typecheck          # Validate TypeScript compilation"
echo "   2. Review/fix any errors   # Address compilation issues"
echo "   3. yarn test              # Ensure functionality" 
echo "   4. rm $INPUT_FILE         # Remove original after validation"
echo ""
echo "💡 Common manual fixes that may still be needed:"
echo "   - Add type parameters: new Set() → new Set<Type>()"
echo "   - Add 'as const': { type: 'process' } → { type: 'process' as const }"
echo "   - Fix trailing commas in multiline type definitions"
echo "   - Convert commas to semicolons in type/interface definitions ONLY"
echo "   - Keep commas in regular object literals (className={...}, state={...})"
echo ""
echo "✨ Automated improvements in this version:"
echo "   ✅ React override modifiers (render, componentDidMount, state)"
echo "   ✅ HTML boolean attributes → React boolean props" 
echo "   ✅ TimeoutID/IntervalID → NodeJS.Timeout type mapping"
echo "   ✅ Improved function parameter name handling (avoids void function issues)"
echo "   ✅ Enhanced React event type conversions (SyntheticFocusEvent, form events)"