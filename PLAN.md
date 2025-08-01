# Flow to TypeScript Migration Plan & Status

## About this document

This document is written for and updated by Claude. It gives a fresh instance of Claude enough context
to proceed with the next step of the migration.

## Current Status (August 1, 2025)

### Progress Summary

- **Type Definitions**: 13/13 files complete (100%)
- **Core Utilities**: 41/41 files complete (100%)  
- **React Components**: ~38/150+ files complete (~25%)
- **Core Dependencies**: All major blocking files converted
- **Build System**: Mixed Flow/TypeScript support working
- **Migration Tooling**: Enhanced dependency analysis available

### Current Priority: Continue Component Migration

**Strategy**: Core dependencies converted, focus on React components using dependency-first approach.

### Migration Status

- `yarn test-all` passes - All checks work correctly
- `yarn typecheck` passes - TypeScript files compile  
- `yarn typecheck:strict` passes - Strict checking for converted modules
- Mixed Flow/TypeScript codebase is stable

### 🔧 Key Commands

```bash
yarn typecheck:strict   # Strict TypeScript checking, uses tsconfig.migration.strict.json
yarn typecheck         # Regular migration checking (used during development), uses tsconfig.migration.json
yarn test-all          # Full validation (lint, test, typecheck)
```

## TypeScript Configuration Setup

### Dual Configuration Strategy

This project uses **three separate TypeScript configurations** to handle the mixed Flow/TypeScript migration:

#### 1. `tsconfig.json` (Primary Config)

- **Purpose**: Base configuration, used by `yarn typecheck-all`. Currently fails.
- **Key settings**:
  - `"allowJs": true` - Allows TypeScript to process `.js` files when imported by `.ts` files
  - `"include": ["src/**/*.ts", "src/**/*.tsx", "src/global.d.ts"]` - Only explicitly includes TypeScript files
  - **Important**: Due to `allowJs: true`, when TypeScript processes `.ts` files that import `.js` files, it will also type-check those `.js` files and fail on Flow annotations

#### 2. `tsconfig.migration.json` (Migration-Specific Config)

- **Purpose**: Safe type checking during migration process, used by `yarn typecheck`. Currently passes.
- **Extends**: `tsconfig.json` but overrides key settings
- **Key settings**:
  - `"allowJs": false` - Completely ignores `.js` files
  - `"exclude": ["src/**/*.js", "src/**/*.jsx"]` - Explicitly excludes all JavaScript files
  - **Result**: Only checks actual TypeScript files, avoiding Flow annotation errors

#### 3. `tsconfig.migration.strict.json` (Migration-Specific Config with )

- **Purpose**: Stricter typechecking, used by `yarn typecheck:strict`. Currently passes but contains excludes list.
- **Extends**: `tsconfig.migration.json` but overrides key settings
- **Key settings**:
  - `"noImplicitAny": true` - Enforces that all imported modules have been converted to TypeScript or have .d.ts type definitions
  - `"strictNullChecks": true` - Catches more mistakes
  - `"exclude": [...]` - Contains a list of files that should be reduced over time
  - **Result**: Allows gradual conversion to strict typechecking without disrupting `yarn typecheck`

---

## Critical Process (Prevents Mistakes)

### Addressing strict typecheck errors for imports

`yarn typecheck:strict` can produce errors of the following form:

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
4. Type declaration files go into src/types/libdef/npm or src/types/libdef/npm-custom, next to the corresponding .js file. For example, check if already exists a types/libdef/npm*/memoize-immutable*.js file. If so, copy this file, give it a name like memoize-immutable_v3.x.x.d.ts, and edit it to convert the type definitions to TypeScript syntax. Then delete the old .js Flow type definition file.

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
- **Don't change runtime behavior of the code** - prefer adjusting types if needed
- **Convert dependencies first** - always follow topological order
- **Per-file conversion only** - avoid global syntax changes across mixed codebase
- **Test after each file** - ensure TypeScript compilation + tests pass before proceeding

Read the original Flow types or the original code by recovering file contents from git history if needed.
Some of the converted types will not have been exercised yet; a newly-converted file might be the first code to exercise the type definition.

### ✅ Proven Strategy

- **Dependency-first migration** resolves import issues systematically
- **Type definitions first** provides stable foundation for all other files
- **Mixed Flow/TypeScript codebase** works reliably during migration

---

## Essential Commands

- `yarn typecheck:strict` - Strict TypeScript checking (current focus)
- `yarn typecheck` - Regular TypeScript checking for converted files
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

Commit whenever a distinct substep is completed.
Reduce scope for the current step if additional complexities are found; it's ok to commit partial work if the remaining work is written down in this file.
Run `yarn prettier-fix` before every commit.
Maintain this `PLAN.md` file with the current status.

## Maintaining PLAN.md

The target audience for this file is a fresh Claude instance with no context.
Include context that's useful to resume the migration with accuracy.
Include examples of conversion patterns that required a few tries to get right.
Include very recent achievements and overall progress.
Minimize self celebration and prioritize accuracy and conciseness.
***CRITICAL**: When deferring complicated work until later, record the remaining steps in this file.
If a phase is only partially complete, but feels complete "in the important ways", still treat it as incomplete until it is actually complete.

---

## Migration Strategy

### Phase 1: ✅ COMPLETED - Infrastructure & Type Definitions

- TypeScript configuration established
- All 13 type definition files converted
- Build system supporting mixed codebase

### Phase 2: ✅ COMPLETED - Utility Files

- All 41 utility files successfully migrated to TypeScript

### Phase 3: 🚀 RESUMED - React Components  

- **Status**: 33/150+ files complete (22%) - **CONTINUED PROGRESS TODAY**
- **Strategy**: Dependency-first migration proving highly effective
- **Recent progress**: 11 files converted in single session with strategic dependency unlocking

### Phase 4: IN PROGRESS - Strict compliance

- **Status**: `yarn typecheck:strict` passes for all converted modules! **MAJOR PROGRESS TODAY**
- **✅ COMPLETED**:
  - ✅ marker-data.js → marker-data.ts conversion (1576 lines)
  - ✅ All reducer modules conversion (profile-view.ts, app.ts, url-state.ts, icons.ts, zipped-profiles.ts, publish.ts, l10n.ts, code.ts)
  - ✅ All NamedTupleMap/memoize-immutable compatibility issues resolved
  - ✅ **NEW TODAY (August 1, 2025)**: Major breakthrough in strict TypeScript compliance:
    - ✅ profile-logic/tracks.js → tracks.ts (core dependency, 1400+ lines)
    - ✅ selectors/url-state.js → url-state.ts (core dependency, 360+ lines)
    - ✅ selectors/per-thread/index.js → index.ts (selector module, 354 lines)
    - ✅ selectors/profile.ts - REMOVED from exclude list, now passes strict checking
    - ✅ Fixed all implicit any type errors across converted files
    - ✅ Created unified Flow→TypeScript conversion script with critical fixes
    - ✅ Previous: shorten-url.ts, flow.ts, query-api.ts, uintarray-encoding.ts, format-numbers.ts, state.ts, data-table-utils.ts, profile-derived.ts, actions.ts - all removed from excludes
- **Remaining for 100% Strict Mode with no exclusion list**:
  - **Current excludes count**: 15 files remaining (down from 17, net -2 progress!) 
  - **✅ NEW TODAY (August 1, 2025)**: Major breakthrough in both strict compliance and strategic conversions:
    - ✅ **REMOVED from exclude list**: DebugWarning.tsx, Icon.tsx (now pass strict checking!)
    - ✅ **STRATEGIC CONVERSIONS (11 files, 869 lines total)**: 
      - **Dependency-driven**: IdleSearchField.tsx → PanelSearch.tsx (unblocked dependency chain)
      - **Major dependency**: Tooltip.tsx (187 lines) - unblocks multiple downstream files
      - **Small components**: CanSelectContent.tsx, TooltipDetails.tsx, ProfileRootMessage.tsx, StyleDef.tsx, TrackSearchField.tsx, Backtrace.tsx, TabBar.tsx
      - **Type definitions**: Window.d.ts global type definitions
  - **✅ ADDITIONAL PROGRESS (August 1, 2025 - Second Session)**: 5 more strategic files converted:
    - **React Components**: MenuButtons/Permalink.tsx (100 lines) - permalink UI component
    - **Error Handling**: CodeErrorOverlay.tsx (125 lines), ErrorBoundary.tsx (135 lines) - improved error boundaries
    - **Core Logic**: profile-logic/profile-store.ts (124 lines) - profile upload/storage functionality
    - **Selectors**: selectors/per-thread/composed.ts (125 lines) - thread-specific data selectors
  - **✅ COMPLETED PREVIOUSLY**: profile-logic/tracks.ts, selectors/url-state.ts (major core dependencies)
  - **Previous**: BlobUrlLink.tsx, ProfileMetaInfoSummary.tsx (dependencies resolved)
  - **Remaining files**: mostly React components + 3 utility files with dependencies
  **Recent Progress**:
- Major core dependencies converted (profile-data.ts, tracks.ts, etc.)
- Key React components converted: WithSize, DivWithTooltip, ButtonWithPanel
- Dependency analysis tool provides conversion priorities

### Phase 5: ⏳ PLANNED - Resume Component Migration

- Resume React component conversions after strict checking passes
- Add TypeScript types to existing ExplicitConnect patterns

### Phase 6: ⏳ PLANNED - Final Cleanup

- Remove Flow infrastructure (.flowconfig, dependencies)
- Update documentation

---

## Next Steps

Use dependency analysis tool to identify files ready for conversion:
```bash
./scripts/analyze-dependencies.sh | head -20
```

Priority: Convert files with 0-1 dependencies first, focusing on files that unlock others.
