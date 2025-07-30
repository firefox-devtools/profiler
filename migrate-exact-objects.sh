#!/bin/bash

# Script to convert Flow exact object types {|...|}  to regular objects {...}
# This handles the bulk conversion of exact object syntax

echo "Converting exact object types from Flow to TypeScript compatible syntax..."

# Find all .js files in src/ and apply the conversions
find src/ -name "*.js" -type f | while read -r file; do
    echo "Processing: $file"
    
    # Convert {| to {
    sed -i '' 's/{|/{/g' "$file"
    
    # Convert |} to }
    sed -i '' 's/|}$/}/g' "$file"
    sed -i '' 's/|}/}/g' "$file"
    
done

echo "Exact object type conversion complete!"
echo "Note: You should review the changes and test the code after this conversion."