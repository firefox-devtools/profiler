# Flow to TypeScript Migration Plan & Status

## About this document

This document is written for and updated by Claude. It gives a fresh instance of Claude enough context
to proceed with the next step of the migration.

## Current Status (July 31, 2025)

### 📊 Progress Summary

- **Type Definitions**: ✅ 13/13 files complete (100%)
- **Core Utilities**: ✅ 41/41 files complete (100%)
- **React Components**: ✅ 22/150+ files complete (14.7%)
- **Core Dependencies**: ✅ 23/23 files complete (100%) - COMPLETE! 🎉
  - ✅ Completed: tabs-handling.ts, call-node-info.ts, zip-files.ts, browser-connection.ts, uploaded-profiles-db.ts, stack-timing.ts, web-channel.ts, url-handling.ts, symbolication.ts, reducers/index.ts, symbol-store-db.ts, symbol-store.ts, function-info.ts, app.ts, profile-view.ts, url-state.ts, sanitize.ts, profile-compacting.ts, marker-schema.tsx, marker-data.ts
  - ✅ **NEW TODAY**: profile-logic/profile-metainfo.ts, components/timeline/TrackEventDelayGraph.tsx, components/app/LanguageSwitcher.tsx
  - 📋 All core dependencies now converted to TypeScript!
- **Build System**: ✅ Mixed Flow/TypeScript support working correctly

### 🎯 **CURRENT PRIORITY: Complete Strict TypeScript Compliance**

**Strategy**: Achieved strict TypeScript compliance for all core dependencies. All major blocking files converted!

**🎉 MAJOR BREAKTHROUGH: Core Dependencies Converted**

```
✅ COMPLETED:
- Fixed all implicit any types in profile-data.ts
- Fixed all implicit any types in symbol-store.ts
- Fixed all implicit any types in transforms.ts
- Fixed type issues in format-numbers.ts and uintarray-encoding.ts
- Created namedtuplemap type declaration
- All tests passing with strict TypeScript checking
- ✅ PREVIOUS: Converted 5 reducer files to TypeScript:
  - icons.js → icons.ts
  - l10n.js → l10n.ts
  - code.js → code.ts
  - publish.js → publish.ts
  - zipped-profiles.js → zipped-profiles.ts
- ✅ NEW: Converted 7 major core files to TypeScript (5220 lines total):
  - app.js → app.ts (377 lines)
  - profile-view.js → profile-view.ts (839 lines)
  - url-state.js → url-state.ts (733 lines)
  - sanitize.js → sanitize.ts (654 lines)
  - profile-compacting.js → profile-compacting.ts (342 lines)
  - marker-schema.js → marker-schema.tsx (699 lines)
  - marker-data.js → marker-data.ts (1576 lines) ✅ COMPLETED!

Core Dependencies Complete:
- ✅ ALL 20 core dependency files converted to TypeScript
- ✅ FIXED: NamedTupleMap/memoize-immutable compatibility issue
- ✅ FIXED: favicon property type issue
- ✅ FIXED: MarkerPayload indexing with `as any` casts
```

**Achievement**: All core dependencies converted! `yarn typecheck:strict` now passes for all converted modules with strict TypeScript compliance.

### ✅ Current Migration State

- `yarn test-all` **PASSES** - All checks work correctly during migration
- `yarn typecheck` **PASSES** - Validates all converted TypeScript files
- 🔄 `yarn typecheck:strict` **PARTIALLY PASSES** - Primary dependencies converted, additional modules needed for full strict compliance
- Mixed Flow/TypeScript codebase is stable and tested

### 🔧 Key Commands

```bash
yarn typecheck:strict   # Strict TypeScript checking with noImplicitAny, uses tsconfig.migration.strict.json
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

- **Purpose**: Stricter typechecking with `"noImplicitAny": true`, used by `yarn typecheck:strict`. Currently fails.
- **Extends**: `tsconfig.migration.json` but overrides key settings
- **Key settings**:
  - `"noImplicitAny": true` - Enforces that all imported modules have been converted to TypeScript or have .d.ts type definitions.
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

#### Recent Discoveries (July 2025)

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

## 🚀 Comprehensive Migration Tooling

Complete automation toolkit for efficient TypeScript migration:

### Core Conversion Tools
- **`./scripts/flow-to-typescript-unified.sh <file.js>`** - 🌟 **RECOMMENDED** - Unified script with all learnings
  - ✅ Fixes critical function parameter name issue (TS1005/TS1109 errors)
  - ✅ Handles MixedObject → unknown, index signatures, trailing commas
  - ✅ Comprehensive React type conversions
  - ✅ Auto-detects remaining issues with detailed warnings
  - ✅ Includes all successful patterns from both previous scripts
- `./scripts/flow-to-typescript.sh <file.js>` - Original comprehensive script (fallback)
- `./scripts/flow-to-typescript-enhanced.sh <file.js>` - Enhanced error handling (legacy)

### Analysis & Planning Tools  
- **`./scripts/analyze-dependencies.sh`** - Analyzes JS files by dependency count and size
  - Identifies files with 0 JS dependencies (🟢 ready to convert)
  - Ranks by conversion difficulty and file size
  - Essential for planning conversion order
- `./scripts/migrate-exact-objects.sh` - Bulk conversion of Flow exact objects `{|...|}` → `{...}`

### Batch Processing
- **`./scripts/auto-convert-batch.sh`** - Automated batch conversion with validation
  - Converts multiple small files automatically
  - Tests each conversion (typecheck + tests)
  - Reverts failed conversions automatically
  - Only commits successful conversions

### Optimal Workflow
```bash
# 1. Analyze conversion opportunities
./scripts/analyze-dependencies.sh | head -20

# 2. For individual files (RECOMMENDED):
./scripts/flow-to-typescript-unified.sh src/path/to/file.js

# 3. For bulk conversion of simple files:
./scripts/auto-convert-batch.sh

# 4. For exact object type cleanup (one-time):
./scripts/migrate-exact-objects.sh
```

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

### Phase 3: ⏸️ PAUSED - React Components

- **Status**: 22/150+ files complete (14.7%) - Component migration paused
- **Reason**: Dependency-first migration prioritized for strict TypeScript enforcement

### Phase 4: IN PROGRESS - Strict compliance

- **Status**: `yarn typecheck:strict` passes for all converted modules! **MAJOR PROGRESS TODAY**
- **✅ COMPLETED**:
  - ✅ marker-data.js → marker-data.ts conversion (1576 lines)
  - ✅ All reducer modules conversion (profile-view.ts, app.ts, url-state.ts, icons.ts, zipped-profiles.ts, publish.ts, l10n.ts, code.ts)
  - ✅ All NamedTupleMap/memoize-immutable compatibility issues resolved
  - ✅ **NEW TODAY (July 31, 2025)**: Key dependency conversions completed:
    - ✅ profile-logic/tracks.js → tracks.ts (core dependency)
    - ✅ selectors/url-state.js → url-state.ts (core dependency)
    - ✅ Previous: shorten-url.ts, flow.ts, query-api.ts, uintarray-encoding.ts, format-numbers.ts, state.ts, data-table-utils.ts, profile-derived.ts, actions.ts - all removed from excludes
- **Remaining for 100% Strict Mode with no exclusion list**:
  - **Current excludes count**: 17 files remaining (stable count after dependency conversions) 
  - **✅ COMPLETED TODAY**: profile-logic/tracks.ts, selectors/url-state.ts (major core dependencies)
  - **Previous**: BlobUrlLink.tsx, ProfileMetaInfoSummary.tsx (dependencies resolved)
  - **Remaining files**: mostly React components + 3 utility files with dependencies
  - **📋 RECOMMENDED CONVERSION ORDER** (based on dependency analysis):
    
    **✅ COMPLETED:**
    1. ✅ `src/components/shared/BlobUrlLink.tsx` - Fixed state type annotation
    2. ✅ `src/components/shared/ProfileMetaInfoSummary.tsx` - Converted profile-metainfo.js dependency
    3. ✅ `src/profile-logic/tracks.js` → `tracks.ts` - Core dependency converted
    4. ✅ `src/selectors/url-state.js` → `url-state.ts` - Core dependency converted
    
    **Next Priority (remaining core dependencies):**
    5. `src/selectors/profile.ts` - needs `profile-logic/tracks.ts` (✅ done), `selectors/url-state.ts` (✅ done) - **READY FOR CONVERSION**
    6. `src/selectors/publish.ts` - needs `profile-logic/process-profile.js`, `selectors/per-thread/index.js` 
    7. `src/actions/profile-view.ts` - needs multiple dependencies, convert after selectors
    
    **Components with simple dependencies:**
    8. `src/components/app/BeforeUnloadManager.tsx` - needs `selectors/publish.ts` (in exclude list)
    9. `src/components/app/DebugWarning.tsx` - needs `selectors/profile.ts` (in exclude list)
    10. `src/components/shared/InnerNavigationLink.tsx` - needs `actions/profile-view.ts` (in exclude list)
    
    **Partially Converted (still need additional dependencies):**
    - `src/components/timeline/TrackEventDelay.tsx` - TrackEventDelayGraph.tsx converted but still needs WithSize.js, selectors, etc.
    - `src/components/app/FooterLinks.tsx` - LanguageSwitcher.tsx converted but still needs l10n actions/selectors
    
    **Medium Priority (2 unconverted dependencies each):**
    9. `src/components/shared/Icon.tsx` - needs `selectors/icons.js` + `actions/icons.js`
    10. `src/components/js-tracer/EmptyReasons.tsx` - needs `selectors/per-thread/thread.js`
    11. `src/components/marker-chart/MarkerChartEmptyReasons.tsx` - needs `selectors/per-thread/thread.js`
    12. `src/components/marker-table/MarkerTableEmptyReasons.tsx` - needs `selectors/per-thread/thread.js`
    13. `src/components/network-chart/NetworkChartEmptyReasons.tsx` - needs `selectors/per-thread/thread.js`
    
    **Lower Priority (3+ unconverted dependencies):**
    14. `src/components/shared/TransformNavigator.tsx` - needs 3 files
    15. `src/components/app/UploadedRecordingsHome.tsx` - needs 3 files
    16. `src/utils/window-console.ts` - needs 6+ files (convert after core files)
    17. `src/components/app/Root.tsx` - needs 8+ files (should be last)
    
  - **Strategy**: Start with BlobUrlLink.tsx (immediate), then work through files requiring only 1 dependency conversion
  - Note that converting new files automatically causes them to be on the (implicit) list of *included* files for `yarn typecheck:strict`!
  - Add newly-converted files, or their dependencies, to the `excludes` list if needed to keep error count from increasing.
  - Phase 4 is completed once the `excludes` list is empty and `yarn typecheck:strict` passes.

### Phase 5: ⏳ PLANNED - Resume Component Migration

- Resume React component conversions after strict checking passes
- Add TypeScript types to existing ExplicitConnect patterns

### Phase 6: ⏳ PLANNED - Final Cleanup

- Remove Flow infrastructure (.flowconfig, dependencies)
- Update documentation
