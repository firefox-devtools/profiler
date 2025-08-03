# Flow to TypeScript Migration Plan & Status

## About this document

This document is written for and updated by Claude. It gives a fresh instance of Claude enough context
to proceed with the next step of the migration.

## Current Status (August 3, 2025)

### Progress Summary

- **Type Definitions**: 13/13 files complete (100%)
- **Core Utilities**: 41/41 files complete (100%)  
- **Selector Files**: Major progress - per-thread selectors converted and strict-compliant
- **React Components**: ~45/150+ files complete (~30%)
- **Strict Type Compliance**: LARGELY COMPLETE - 14 files excluded from strict checking
- **Core Dependencies**: All major blocking files converted
- **Build System**: Mixed Flow/TypeScript support working
- **Migration Tooling**: Enhanced dependency analysis available

### Current Priority: Continue Systematic File-by-File Migration

**Strategy**: With core infrastructure complete, continue dependency-first migration of remaining JavaScript files. Focus on files with zero or minimal dependencies first.

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

// Nullable: ?string → string | null | undefined (though usually just | null is enough)
prop: ?string                              // Flow
prop: string | null                        // TypeScript (more common)
prop: string | null | undefined            // TypeScript (exact match for Flow semantics)

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
function process(profile: ?Profile)                    // Flow
function process(profile: Profile | null | undefined)  // TypeScript

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

**Recently Discovered Patterns (August 2025):**
- **Flow spread in types**: `{...TypeA, ...TypeB}` → `TypeA & TypeB` (intersection types)
- **Function parameters in types**: `(Type1, Type2) => ReturnType` → `(param1: Type1, param2: Type2) => ReturnType`
- **Selector parameter annotations**: Complex selectors often need explicit type annotations for parameters
- **Dynamic property access**: Use `(obj as any)[key]` for dynamic object property access
- **Array type initialization**: `const arr = []` → `const arr: Type[] = []`
- **Nullable type handling**: `param ?? fallback` for handling potentially null values from arrays

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

### Phase 3: 🚀 IN PROGRESS - Systematic File Migration

- **Status**: 57 JavaScript files remaining (down from 67)
- **TypeScript files**: 238 (up from 228)
- **Strategy**: Dependency-first migration focusing on zero-dependency files first
- **Recent major conversions (August 3, 2025)**:
  - **LATEST SESSION**: 10 component files converted (1,376 lines) - TrackCustomMarker, TrackVisualProgress, AssemblyViewToggleButton, MarkerFiltersContextMenu, TrackProcessCPU, StackImplementationSetting, CallTreeStrategySetting, ProfileName, MarkerSettings, StackSettings
  - **Core selectors**: src/selectors/per-thread/ (thread.tsx, markers.ts, stack-sample.ts)
  - **Profile logic**: src/profile-logic/merge-compare.ts (1,447 lines)
  - **CLI tools**: src/symbolicator-cli/index.ts
  - **EmptyReasons components**: StackChart, CallTree, FlameGraph (183 lines)
  - **Timeline components**: TrackBandwidthGraph.tsx (716 lines), TrackBandwidth.tsx (84 lines), TrackPower.tsx (84 lines), TrackCustomMarkerGraph.tsx (636 lines)
  - **Selector infrastructure**: src/selectors/index.ts (48 lines)
  - **App components**: SourceCodeFetcher.tsx (135 lines), WindowTitle.tsx (149 lines), AssemblyCodeFetcher.tsx (150 lines)
  - **Settings components**: NetworkSettings.tsx (63 lines), js-tracer/Settings.tsx (68 lines)
  - **Tooltip components**: Marker.tsx (538 lines) - Advanced union type handling
  - **Sidebar components**: MarkerSidebar.tsx (65 lines) - Simple state mapping component
  - **Network components**: NetworkChartRow.tsx (531 lines) - Complex event handling and dynamic property access
  - **Total converted**: 33 files, 8,265 lines of code

### Phase 4: ✅ LARGELY COMPLETED - Strict TypeScript compliance

- **Status**: `yarn typecheck` passes consistently, 5 files excluded from strict checking (down from 8)
- **Key achievements**:
  - Successfully resolved circular dependencies between thread/markers selectors
  - Converted Flow spread syntax to TypeScript intersection types
  - Fixed complex selector parameter type mismatches
  - **BREAKTHROUGH**: Fixed per-thread selector strict compliance (August 3, 2025)
    - Resolved TypeScript interface type mismatches in _buildThreadSelectors
    - Fixed dynamic property access with proper type assertions
    - Removed from strict exclude list, unblocking downstream conversions
  - **LATEST FIXES**: Fixed 3 critical infrastructure files (August 3, 2025)
    - publish.ts: Fixed mixed → unknown type conversion
    - BeforeUnloadManager.tsx: Already compliant, removed from exclude list
    - profile-view.ts: Already compliant, removed from exclude list (2,077 lines)
  - All core infrastructure files now pass strict TypeScript compilation
- **Type declarations created**: array-range, simpleperf_report, call-tree

### Phase 5: 🚀 CURRENT FOCUS - Continue File-by-File Migration

- Continue systematic conversion using dependency analysis
- Target files with 0-1 dependencies to unlock downstream conversions
- Focus on high-impact files that enable multiple downstream conversions

### Phase 6: ⏳ PLANNED - Final Cleanup

- Remove Flow infrastructure (.flowconfig, dependencies)
- Update documentation

---

## Next Steps

**Current Strategy**: Continue systematic file-by-file conversion using dependency-first approach.

### Immediate Next Actions

1. **Use dependency analysis** to identify next conversion targets:
   ```bash
   ./scripts/analyze-dependencies.sh | head -25
   ```

2. **Conversion Priority**:
   - **Priority 1**: Files with 0 dependencies (ready for immediate conversion)
   - **Priority 2**: Files with 1 dependency (convert dependency first if needed)
   - **Priority 3**: TypeScript files needing strict compliance fixes (remove from exclude list)

3. **High-Impact Targets**: Look for files that, once converted, unlock many downstream files

### Conversion Process (Refined August 2025)

1. **Always start with dependency analysis** to identify ready files
2. **Use unified conversion script**: `./scripts/flow-to-typescript-unified.sh <file.js>`
3. **Fix TypeScript compilation errors**:
   - Flow spread syntax (`{...A, ...B}`) → TypeScript intersections (`A & B`)
   - Function parameter names in type signatures
   - Proper type annotations for arrays and function parameters
   - Add missing type imports
4. **Validate**: `yarn typecheck && yarn test`
5. **Clean up**: Remove original `.js` file only after successful validation
6. **Commit frequently** to maintain progress

### Special Cases Proven Successful

- **Circular dependencies**: Convert entire cycle simultaneously (thread.js ↔ markers.js)
- **Complex selectors**: Add explicit type annotations for parameters
- **Large files**: merge-compare.ts (1,447 lines) successfully converted with systematic type fixes

### Lessons Learned (August 2025)

- **Dependency analysis is crucial** - always check before converting
- **TypeScript compilation must pass** before removing original files
- **Type assertion (`as any`)** is acceptable for dynamic property access during migration
- **Parameter type annotations** often needed for complex selector functions
- **Canvas context null assertions** - use `canvas.getContext('2d')!` for TypeScript strict mode
- **CO2 library integration** - requires careful type handling for union return types
- **External library types** - use `InstanceType<typeof Library>` for proper constructor types
- **Union type narrowing** - use `'property' in object` pattern for type guards
- **MarkerPayload type safety** - union types require property checks before accessing
- **ScreenshotPayload variants** - guard for windowWidth/windowHeight before using
- **Dynamic property access** - use `(obj as any)[key]` for computed property access
- **React event types** - provide element type parameter: `React.MouseEvent<HTMLDivElement>`
- **Custom window properties** - use `(window as any).customProperty` for non-standard APIs
- **Null safety with nullish coalescing** - use `(value ?? fallback)` for handling possible null returns
- **Flow spread in types** - convert `{...TypeA, ...TypeB}` to `TypeA & TypeB` (intersection types)
- **Canvas context null safety** - use `canvas.getContext('2d')!` assertion for known-safe contexts
- **Mixed codebase stability** - Flow and TypeScript coexist reliably
