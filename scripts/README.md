# Migration Scripts

## Flow to TypeScript Conversion Script

### Usage

```bash
./scripts/flow-to-typescript.sh <input.js> [output.ts]
```

If no output file is specified, creates `<basename>.ts` in the same directory.

### What it does

This script automates the most common Flow→TypeScript conversion patterns:

1. **Removes `// @flow` directive**
2. **Converts import statements**: `import type {` → `import {`
3. **Converts readonly properties**: `+prop:` → `readonly prop:`
4. **Converts nullable types**: `?string` → `string | null` (for common types)
5. **Converts type annotations**: `(value: Type)` → `value as Type`
6. **Converts Flow utility types**: `$Keys<T>` → `keyof T`, etc.
7. **Converts object type casting**: `({}: Type)` → `({} as Type)`

### What requires manual review

The script handles the most common patterns, but you'll still need to manually fix:

- Complex multiline type definitions
- Generic constructor types (`new Set()` → `new Set<T>()`)
- React component overrides (add `override` keyword)
- Complex nullable types beyond string/number/boolean
- Trailing commas in type definitions
- Type compatibility issues with `combineReducers`

### Workflow

1. Run the script to handle basic conversions
2. Fix any remaining TypeScript errors manually
3. Run `yarn typecheck` to validate
4. Run `yarn test` to ensure functionality
5. Remove the original `.js` file after validation

### Example

```bash
# Convert a reducer file
./scripts/flow-to-typescript.sh src/reducers/example.js

# This creates src/reducers/example.ts with basic conversions applied
# Then manually review and fix remaining issues
```
