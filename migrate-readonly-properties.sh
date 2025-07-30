#!/bin/bash

# Migration script for converting Flow readonly properties to TypeScript-compatible syntax
# Converts "+prop: Type" to "readonly prop: Type"

set -e

echo "🔍 Finding files with readonly properties..."

# Find all JavaScript files with readonly properties
files_with_readonly=$(grep -l "\+[a-zA-Z_][a-zA-Z0-9_]*:" src/ -r --include="*.js" | grep -v node_modules || true)

if [ -z "$files_with_readonly" ]; then
    echo "✅ No readonly properties found to convert"
    exit 0
fi

echo "📝 Found readonly properties in these files:"
echo "$files_with_readonly"
echo ""

# Count total occurrences
total_count=$(grep -r "\+[a-zA-Z_][a-zA-Z0-9_]*:" src/ --include="*.js" | wc -l | tr -d ' ')
echo "📊 Total readonly properties to convert: $total_count"
echo ""

# Process each file
for file in $files_with_readonly; do
    echo "🔧 Processing: $file"
    
    # Convert +propName: Type to readonly propName: Type
    # This handles the most common pattern of readonly properties in Flow
    sed -i.bak 's/+\([a-zA-Z_][a-zA-Z0-9_]*\):/readonly \1:/g' "$file"
    
    # Remove backup file
    rm "$file.bak"
    
    # Count changes in this file
    changes=$(grep -c "readonly [a-zA-Z_][a-zA-Z0-9_]*:" "$file" || echo "0")
    echo "   ✓ Converted $changes readonly properties"
done

echo ""
echo "✅ Migration complete!"

# Verify the changes
final_count=$(grep -r "readonly [a-zA-Z_][a-zA-Z0-9_]*:" src/ --include="*.js" | wc -l | tr -d ' ')
remaining_count=$(grep -r "\+[a-zA-Z_][a-zA-Z0-9_]*:" src/ --include="*.js" | wc -l | tr -d ' ')

echo "📊 Final statistics:"
echo "   - Converted to 'readonly': $final_count"
echo "   - Remaining '+prop:' patterns: $remaining_count"

if [ "$remaining_count" -gt 0 ]; then
    echo ""
    echo "⚠️  Some patterns may require manual review:"
    grep -r "\+[a-zA-Z_][a-zA-Z0-9_]*:" src/ --include="*.js" | head -5
fi

echo ""
echo "🧪 Running tests to verify no regressions..."
yarn test > /dev/null 2>&1 && echo "✅ Tests pass!" || echo "❌ Tests failed - please review changes"