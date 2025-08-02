# Flow to TypeScript Migration Plan & Status

## About this document

This document is written for and updated by Claude. It gives a fresh instance of Claude enough context
to proceed with the next step of the migration.

## Current Status (August 2, 2025)

### Progress Summary

- **Type Definitions**: 13/13 files complete (100%)
- **Core Utilities**: 41/41 files complete (100%)  
- **React Components**: ~42/150+ files complete (~28%)
- **Strict Type Compliance**: LARGELY COMPLETE - 19 minor errors remain (down from 100+)
- **Core Dependencies**: All major blocking files converted
- **Build System**: Mixed Flow/TypeScript support working
- **Migration Tooling**: Enhanced dependency analysis available

### Current Priority: Continue Component Migration

**Strategy**: Core dependencies converted, strict compliance improved significantly, focus on React components using dependency-first approach.

### Migration Status

- `yarn test-all` passes - All checks work correctly
- `yarn typecheck` passes - TypeScript files compile
- Mixed Flow/TypeScript codebase is stable

### 🔧 Key Commands

```bash
yarn typecheck         # Regular migration checking (used during development), uses tsconfig.migration.json
yarn test-all          # Full validation (lint, test, typecheck)
```

## TypeScript Configuration Setup

### Dual Configuration Strategy

This project uses **two separate TypeScript configurations** to handle the mixed Flow/TypeScript migration:

#### 1. `tsconfig.json` (Primary Config)

- **Purpose**: Base configuration, used by `yarn typecheck-all`. Currently fails.
- **Key settings**:
  - `"allowJs": true` - Allows TypeScript to process `.js` files when imported by `.ts` files
  - **Important**: Due to `allowJs: true`, when TypeScript processes `.ts` files that import `.js` files, it will also type-check those `.js` files and fail on Flow annotations

#### 2. `tsconfig.migration.json` (Migration-Specific Config)

- **Purpose**: Safe type checking during migration process, used by `yarn typecheck`. Currently passes.
- **Extends**: `tsconfig.json` but overrides key settings
- **Key settings**:
  - `"allowJs": false` - Completely ignores `.js` files
  - `"exclude": [...]` - Explicitly excludes a short list of partially converted files
  - **Result**: Only checks actual TypeScript files, avoiding Flow annotation errors

---

## Critical Process (Prevents Mistakes)

### Addressing strict typecheck errors for imports

`yarn typecheck` can produce errors of the following form:

```
error TS7016: Could not find a declaration file for module
```

The imported module is either a file that needs to converted, or it is an npm dependency. Follow the appropriate steps below.

### File Conversion Steps - MUST FOLLOW IN ORDER

1. ⚠️ **ALWAYS USE THE UNIFIED SCRIPT FIRST**: `./scripts/flow-to-typescript-unified.sh <file.js>` - This handles most conversions automatically including the critical function parameter name fix
2. **FALLBACK OPTIONS** (if unified script fails):
   - Try: `./scripts/flow-to-typescript.sh <file.js>` - Original comprehensive script
   - Last resort: Manual `cp` + conversions
3. **Either way**: Remove `// @flow` (done automatically by scripts)
4. **CRITICAL**: Test compilation: `yarn typecheck` (project-wide is fastest)
5. **CRITICAL**: Do not rewrite the file from scratch. Check errors first and then make tightly-scoped edits.
6. Apply remaining conversion patterns manually (see below)
7. **CRITICAL**: Fix ALL compilation errors before proceeding
8. Only after successful compilation, remove original `.js` file
9. Run tests to ensure no regressions
10. **CRITICAL**: Run `yarn prettier-fix` prior to committing.

### npm Dependency Declaration Files

1. Check if a @types package for the module exists. For example, for `memoize-immutable`, try installing `@types/memoize-immutable` via `yarn add --dev @types/memoize-immutable`.
2. If the @types package exists, ensure its version matches the version of the actual package. Edit package.json manually and run `yarn install` if needed.
3. If no @types package exists, create a type declaration file yourself.
4. Type declaration files go into src/types/@types/package-name/index.d.ts. You can look at an existing Flow type definition file for inspiration. For example, when creating src/types/@types/memoize-immutable/index.d.ts, check if there already exists a types/libdef/npm*/memoize-immutable*.js file.

### ⚡ Efficient Commands (Use These)

```bash
# TypeScript compilation check (fast, use this)
yarn typecheck

# Combined check, test, and remove in one command (most efficient)
yarn typecheck && yarn test && rm src/utils/filename.js

# Batch operations for multiple files
yarn typecheck && yarn test && rm src/utils/file1.js src/utils/file2.js

# Stage and commit changes
git add -A
git commit -m "Convert X files to TypeScript"
```

### ❌ Inefficient Commands (Avoid These)

```bash
# DON'T: Individual file checking (too slow)
yarn typecheck-file src/utils/filename.ts
npx tsc --noEmit --skipLibCheck src/utils/filename.ts

# DON'T: Project + file mixing (causes errors)
npx tsc --noEmit --skipLibCheck --project tsconfig.migration.json src/utils/filename.ts

# DON'T: Direct tsc without yarn (missing from PATH)
tsc --noEmit --skipLibCheck --project tsconfig.migration.json

# DON'T: Separate test runs (wastes time)
yarn typecheck
rm src/utils/filename.js
yarn test  # Run together instead
```

### 💡 Pro Tips

- **Project-wide `yarn typecheck` is faster** than individual file checks
- **Batch multiple file conversions** before testing to save time
- **Use `&&` operators** to chain commands efficiently
- **Remove original files only after** successful TypeScript compilation
- **The migration config is optimized** - project-wide checks are very fast (~0.65s)

### Key Flow→TypeScript Conversion Patterns

#### Essential Changes

```typescript
// Imports: Remove 'type' keyword
import type { SomeType } from './module';  // Flow
import { SomeType } from './module';       // TypeScript

// Properties: +prop → readonly prop
type Example = { +prop: string };          // Flow
type Example = { readonly prop: string };  // TypeScript

// Nullable: ?string → string | null
prop: ?string                              // Flow
prop: string | null                        // TypeScript

// React overrides: Add 'override' keyword
class Component extends PureComponent<Props> {
  state = { value: true };                 // Flow
  override state = { value: true };        // TypeScript
}

// Type annotations: (value: Type) → value as Type
return (action.selectedThreads: Set<ThreadIndex>);  // Flow
return action.selectedThreads as Set<ThreadIndex>;  // TypeScript

// Generic constructors: Specify type parameters
const items = new Set();                   // Flow (inferred)
const items = new Set<ThreadIndex>();      // TypeScript (explicit)
```

#### Common Utility Type Mappings

```typescript
$Keys<T> → keyof T
$ReadOnly<T> → Readonly<T>
$Shape<T> → Partial<T>
mixed → unknown
Array.from(set) replaces [...set] for type safety
```

### Other conversion patterns

**🚨 MOST IMPORTANT**: Function parameter names in TypeScript function types
```typescript
// WRONG - Causes TS1005/TS1109 errors
const selector: Selector<(Action | Action[]) => string>        

// CORRECT - TypeScript requires parameter names
const selector: Selector<(actionList: Action | Action[]) => string>
```

**🔧 Type Safety in Union Types**: Proper type narrowing patterns
```typescript
// Property access on union types requires narrowing
if (localTrack.type === 'thread') {
  localTrack.threadIndex; // ✅ Works
} else if ('counterIndex' in localTrack && typeof localTrack.counterIndex === 'number') {
  localTrack.counterIndex; // ✅ Proper narrowing
}
```

**🏗️ Complex Type Conversions**: Flow spread syntax → TypeScript intersections
```typescript
// Flow spread in type definitions
export type ThreadSelectors = {
  ...ThreadSelectorsPerThread,
  ...MarkerSelectorsPerThread,
};

// TypeScript intersection types
export type ThreadSelectors = ThreadSelectorsPerThread & MarkerSelectorsPerThread;
```

```typescript
// CRITICAL: Function types must have parameter names in TypeScript
// This addresses TS1005 "'>' expected" and TS1109 "Expression expected" errors
const selector: Selector<(Action | Action[]) => string>        // Flow (FAILS)
const selector: Selector<(actionList: Action | Action[]) => string>  // TypeScript (WORKS)

// The > character in "=> string" confuses the parser when parameters lack names
// Error occurs because TypeScript expects "param: Type" syntax, not just "Type"

// Set constructors need explicit type parameters  
const items = new Set();                   // Flow (inferred)
const items = new Set<ThreadIndex>();      // TypeScript (explicit)

// Nullable types: Flow → TypeScript syntax
function process(profile: ?Profile)        // Flow
function process(profile: Profile | null)  // TypeScript

// Literal types need 'as const' for proper inference
const track = { type: 'process' };         // Inferred as string
const track = { type: 'process' as const }; // Inferred as 'process'

// Trailing commas in multiline type definitions
type Selector<
  ReturnType,
> = (state) => ReturnType;                 // Flow (allowed)
type Selector<
  ReturnType
> = (state) => ReturnType;                 // TypeScript (required)

// API validation with unknown types
function validate(result: unknown): APIType {
  // Runtime validation
  if (!isObject(result) || !('property' in (result as object))) {
    throw new Error('Invalid structure');
  }
  // Type assertion after validation
  return result as APIType;
}

// Index signatures require key names in TypeScript
type FlowType = { [string]: boolean };     // Flow
type TSType = { [key: string]: boolean };  // TypeScript

// MixedObject → unknown (more type-safe than any)
callback: () => Promise<MixedObject>       // Flow
callback: () => Promise<unknown>           // TypeScript

// void vs undefined return types
function compute(): Float64Array | void    // Flow (problematic)
function compute(): Float64Array | undefined  // TypeScript (correct)

// Parameter typing in arrow functions
const isObject = (subject) => ...          // Implicit any
const isObject = (subject: unknown) => ... // Explicit type

// Canvas context null checking (strict mode)
const ctx = canvas.getContext('2d');       // returns CanvasRenderingContext2D | null
const ctx = canvas.getContext('2d')!;      // TypeScript strict: assert non-null

// Array type declarations for empty arrays
const cache = [];                          // Implicit any[]
const cache: boolean[] = [];               // Explicit type array

// Type assertions for array operations
[].concat(...arrays)                       // Type 'never[]' error
([] as SomeType[]).concat(...arrays)       // Correct type assertion

// Module declarations for missing types
declare module './missing-module' {
  export const someExport: any;
}
```

### `withSize` higher-order React component

The props type argument `P` in `withSize<P>(...)` is now the props **without width/height**. As a consequence, it's better to just let TypeScript infer `P` type automatically, by removing the explicit argument.

```typescript
withSize<Props>(ComponentImpl) → withSize(ComponentImpl) // Remove explicit type argument
```

---

## Key Lessons Learned

### ⚠️ Critical Guidelines

- **Never update snapshots** without investigating root cause of differences
- **Take TypeScript type definitions with a grain of salt** - they were created from Flow types
- **NEVER change runtime behavior** - relax types instead
- **Convert dependencies first** - always follow topological order
- **Per-file conversion only** - avoid global syntax changes across mixed codebase
- **Test after each file** - ensure TypeScript compilation + tests pass before proceeding
- **ALWAYS prefer to adjust types instead of changing code**

Read the original Flow types or the original code by recovering file contents from git history if needed.
Some of the converted types will not have been exercised yet; a newly-converted file might be the first code to exercise the type definition.

For example, the argument type of a method might be `React.MouseEvent<HTMLCanvasElement>`
when it only really needs to be `React.MouseEvent<HTMLElement>`. Relax the type rather than
passing a different event.

To reiterate: Whenever you fix a type checking error, make sure that the fixed code has the
exact same runtime behavior as before. If you changed the behavior in order to make the type
checker happy, revert your change and see if you can change the types instead. If a solution
remains elusive, it's sometimes fine to add `as any` workarounds, after alternatives have
been explored.

### ✅ Proven Strategy

- **Dependency-first migration** resolves import issues systematically
- **Type definitions first** provides stable foundation for all other files
- **Mixed Flow/TypeScript codebase** works reliably during migration

---

## Essential Commands

- `yarn typecheck` - TypeScript checking for converted files (current focus)
- `yarn test-all` - Full validation (must pass after each conversion)

## Migration Tools

**Conversion**: `./scripts/flow-to-typescript-unified.sh <file.js>` - Primary conversion script
**Analysis**: `./scripts/analyze-dependencies.sh` - Shows files ready for conversion by dependency count  
**Batch**: `./scripts/auto-convert-batch.sh` - Converts multiple files automatically

---

## Conversion Script Notes

The `flow-to-typescript-unified.sh` script handles most conversions automatically. Recent improvements (August 2025) include:

**✅ Automated Fixes:**
- React `override` modifiers (render, componentDidMount, state)
- HTML boolean attributes → React boolean props (`required="required"` → `required={true}`)
- TimeoutID/IntervalID → NodeJS.Timeout type mapping
- Enhanced React event type conversions
- Improved function parameter name handling

**Key manual fixes that may still be needed:**
- Add type parameters to generic constructors (`new Set()` → `new Set<Type>()`)
- Add 'as const' for literal type inference
- Convert commas to semicolons in type/interface definitions only

---

## General guidelines

- Commit whenever a distinct substep is completed.
- Reduce scope for the current step if additional complexities are found; it's ok to commit partial work if the remaining work is written down in this file.
- Run `yarn prettier-fix` before every commit.
- Maintain this `PLAN.md` file with the current status.

## Maintaining PLAN.md

- The target audience for this file is a fresh Claude instance with no context.
- Include context that's useful to resume the migration with accuracy.
- Include examples of conversion patterns that required a few tries to get right.
- Include very recent achievements and overall progress.
- Minimize self celebration and prioritize accuracy and conciseness.
- ***CRITICAL**: When deferring complicated work until later, record the remaining steps in this file.
- If a phase is only partially complete, but feels complete "in the important ways", still treat it as incomplete until it is actually complete.

---

## Migration Strategy

### Phase 1: ✅ COMPLETED - Infrastructure & Type Definitions

- TypeScript configuration established
- All 13 type definition files converted
- Build system supporting mixed codebase

### Phase 2: ✅ COMPLETED - Utility Files

- All 41 utility files successfully migrated to TypeScript

### Phase 3: 🚀 IN PROGRESS - React Components  

- **Status**: ~42/150+ files complete (28%)
- **Strategy**: Dependency-first migration
- **Recent progress**: ActivityGraph.tsx, ActivityGraphFills.tsx converted during strict compliance work

### Phase 4: ✅ LARGELY COMPLETED - Strict compliance

- **Status**: `yarn typecheck` passes, 16 files excluded
- **Recent conversions**:
  - August 2: Canvas.tsx, ActivityGraphCanvas.tsx, ActivityGraphFills.tsx, VirtualList.tsx, art-trace.tsx, js-tracer.tsx, ActivityGraph.tsx
  - August 1: profile-logic/tracks.ts, selectors/url-state.ts, selectors/per-thread/index.ts
  - Previous: marker-data.ts, reducer modules, core utilities
- **Type declarations created**: array-range, simpleperf_report, call-tree
- **Remaining errors**: 19 minor issues, primarily TS7053 (dynamic object property access)

### Phase 5: ⏳ PLANNED - Resume Component Migration

- Resume React component conversions using dependency-first approach
- Add TypeScript types to existing ExplicitConnect patterns

### Phase 6: ⏳ PLANNED - Final Cleanup

- Remove Flow infrastructure (.flowconfig, dependencies)
- Update documentation

---

## Next Steps

Continue React component conversion using dependency-first approach.

Use dependency analysis tool to identify files ready for conversion:
```bash
./scripts/analyze-dependencies.sh | head -28
```

Convert files with 0-1 dependencies first, focusing on files that unlock others.

When converting a file with a dependency, `yarn typecheck` will only pass once
the types for the dependency are known, so keep that in mind - it means that you
really have to convert the dependency as well.

If you encounter cyclic dependencies, you'll have to convert the entire cycle. Or
you could try to declare temporary types for the imported module, but you'll have
to figure out how to make that work.
