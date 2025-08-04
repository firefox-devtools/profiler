# Migration Scripts

## 🌟 Recommended: Unified Flow to TypeScript Conversion

### Usage

```bash
./scripts/flow-to-typescript.sh <input.js> [output.ts]
```

**This is the recommended script** - it combines all learnings from the migration process including critical fixes for function parameter names that prevent TS1005/TS1109 compilation errors.

### What it does

The unified script automates all Flow→TypeScript conversion patterns:

1. **Critical function type fixes**: Adds parameter names to prevent TS1005/TS1109 errors
2. **Removes `// @flow` directive**
3. **Converts nullable types**: `?string` → `string | null`
4. **Fixes trailing commas** in multiline type definitions
5. **Converts Flow utility types**: `$Keys<T>` → `keyof T`, `mixed` → `unknown`
6. **Fixes index signatures**: `[string]:` → `[key: string]:`
7. **Converts React types**: `React.Node` → `React.ReactNode`
8. **Auto-detects remaining issues** with detailed warnings

### What requires manual review

Even with comprehensive automation, you may still need to fix:

- Set type parameters: `new Set()` → `new Set<Type>()`
- Literal type inference: `{ type: 'process' }` → `{ type: 'process' as const }`
- Complex multiline type definitions
- React component overrides (add `override` keyword)

### Other Tools

- `./scripts/analyze-dependencies.sh` - Analyze conversion priorities
- `./scripts/auto-convert-batch.sh` - Batch convert multiple files
- `./scripts/migrate-exact-objects.sh` - Convert Flow exact objects `{|...|}` → `{...}`

### Optimal Workflow

```bash
# 1. Analyze what needs converting
./scripts/analyze-dependencies.sh | head -10

# 2. Convert individual files (recommended)
./scripts/flow-to-typescript.sh src/path/to/file.js

# 3. OR batch convert simple files
./scripts/auto-convert-batch.sh

# 4. Validate and test
yarn typecheck && yarn test

# 5. Clean up original file
rm src/path/to/file.js
```
