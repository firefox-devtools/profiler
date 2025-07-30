# Flow to TypeScript Migration Plan & Status

## Current Status (July 30, 2025)

### 🎉 MAJOR MILESTONE ACHIEVED!

**ALL UTILITY FILES SUCCESSFULLY MIGRATED TO TYPESCRIPT** ✅

This represents a significant achievement in the Flow→TypeScript migration:

- **100% of utility files converted** (41/41 files)
- **Complex Flow features successfully translated** including `$ObjMap`, `$Call`, generic bounds
- **All tests continue to pass** - no functionality broken during migration
- **Advanced type safety maintained** with proper TypeScript equivalents

### 📊 Progress

- **Type Definitions**: ✅ 13/13 files complete (100%)
- **Core Utilities**: ✅ 40/40 files complete (100%) - colors.ts, string.ts, format-numbers.ts, errors.ts, base64.ts, bisect.ts, pretty-bytes.ts, sha1.ts, set.ts, magic.ts, analytics.ts, l10n-pseudo.ts, path.ts, time-code.ts, number-series.ts, jwt.ts, shorten-url.ts, uintarray-encoding.ts, range-set.ts, special-paths.ts, string-table.ts, window-console.ts, css-geometry-tools.ts, gz.ts, react.ts, flow.ts, index.ts, codemirror-shared.ts, data-table-utils.ts, resize-observer-wrapper.ts, text-measurement.ts, url.ts, l10n-ftl-functions.ts, query-api.ts, worker-factory.ts, **mocks**/worker-factory.ts, fetch-assembly.ts, untar.ts, fetch-source.ts, connect.ts
- **React Components**: ✅ 6/150+ files started (4.0%) - Warning.tsx, BlobUrlLink.tsx, FooterLinks.tsx, DebugWarning.tsx, EmptyReasons.tsx, Icon.tsx
- **Build System**: ✅ Mixed Flow/TypeScript support working correctly

### 🎯 Next Steps

1. ✅ **COMPLETED**: All utility files migrated (100%)!
   - Successfully converted complex connect.js with advanced Flow features
   - All 41 utility files now use TypeScript
2. ✅ **IN PROGRESS**: React component migration started (6 components complete)
   - Successfully converted simple presentational and connected components
   - Proven patterns for TypeScript component conversions established
   - Union type handling with type guards ('displayData' in ownProps)
3. Continue React component migration with more leaf components
4. Maintain test validation after each conversion

### ✅ Current Migration State

- `yarn test-all` **PASSES** - All checks work correctly during migration
- `yarn typecheck` validates all converted TypeScript files
- Mixed Flow/TypeScript codebase is stable and tested

## TypeScript Configuration Setup

### Dual Configuration Strategy

This project uses **two separate TypeScript configurations** to handle the mixed Flow/TypeScript migration:

#### 1. `tsconfig.json` (Primary Config)

- **Purpose**: Full project configuration with Flow compatibility
- **Key settings**:
  - `"allowJs": true` - Allows TypeScript to process `.js` files when imported by `.ts` files
  - `"include": ["src/**/*.ts", "src/**/*.tsx", "src/global.d.ts"]` - Only explicitly includes TypeScript files
  - **Important**: Due to `allowJs: true`, when TypeScript processes `.ts` files that import `.js` files, it will also type-check those `.js` files and fail on Flow annotations

#### 2. `tsconfig.migration.json` (Migration-Specific Config)

- **Purpose**: Safe type checking during migration process
- **Extends**: `tsconfig.json` but overrides key settings
- **Key settings**:
  - `"allowJs": false` - Completely ignores `.js` files
  - `"exclude": ["src/**/*.js", "src/**/*.jsx"]` - Explicitly excludes all JavaScript files
  - **Result**: Only checks actual TypeScript files, avoiding Flow annotation errors

### Commands & Usage

```bash
# Migration-safe type checking (recommended during development)
yarn typecheck  # Uses tsconfig.migration.json

# Full project type checking (use when migration is complete)
yarn typecheck-all  # Uses default tsconfig.json
```

---

## Critical Process (Prevents Mistakes)

### File Conversion Steps - MUST FOLLOW IN ORDER

1. Copy `.js` → `.ts/.tsx`
2. Remove `// @flow`
3. Apply conversion patterns (see below)
4. **CRITICAL**: Test compilation: `yarn typecheck` (project-wide is fastest)
5. **CRITICAL**: Fix ALL compilation errors before proceeding
6. Only after successful compilation, remove original `.js` file
7. Run tests to ensure no regressions
8. **CRITICAL**: Run `yarn prettier-fix` prior to committing.

### ⚡ Efficient Commands (Use These)

```bash
# TypeScript compilation check (fast, use this)
yarn typecheck

# Combined check, remove, and test in one command (most efficient)
yarn typecheck && rm src/utils/filename.js && yarn test

# Batch operations for multiple files
yarn typecheck && rm src/utils/file1.js src/utils/file2.js && yarn test

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

### Proven Flow→TypeScript Conversion Patterns

#### React Component Patterns

```typescript
// Flow class component
class ComponentName extends PureComponent<Props, State> {
  state = { value: true };
  render() { ... }
}

// TypeScript class component
class ComponentName extends PureComponent<Props, State> {
  override state = { value: true };
  override render() { ... }
}
```

#### Connected Component Pattern

```typescript
// Flow
import type { ConnectedProps } from '../../utils/connect';
type StateProps = {
  +prop: string,
};

// TypeScript
import { ConnectedProps } from '../../utils/connect';
type StateProps = {
  readonly prop: string;
};
```

#### 1. Import Statements

```typescript
// Flow
import type { SomeType } from './module';

// TypeScript
import { SomeType } from './module';
```

#### 2. Readonly Properties

```typescript
// Flow
type Example = {
  +prop: string,
};

// TypeScript
type Example = {
  readonly prop: string,
};
```

#### 3. Nullable Types

```typescript
// Flow
prop: ?string,
array: Array<?number>,

// TypeScript
prop: string | null,
array: Array<number | null>,
```

#### 4. Flow Utility Types

```typescript
// Flow → TypeScript
$Keys<T> → keyof T
$Values<T> → T[keyof T]
$ReadOnly<T> → Readonly<T>
$Shape<T> → Partial<T>
$PropertyType<T, 'prop'> → T['prop']
mixed → unknown
```

#### 5. Set Operations (Important Fix)

```typescript
// Flow (causes TS errors)
return new Set([...set1].filter((x) => set2.has(x)));

// TypeScript (correct)
return new Set(Array.from(set1).filter((x) => set2.has(x)));
```

#### 6. Function Types

```typescript
// Flow
type Fn = ('send', GAPayload) => void;

// TypeScript
type Fn = (command: 'send', payload: GAPayload) => void;
```

#### 7. Union Type Handling

```typescript
// Flow
const icon = ownProps.displayData
  ? ownProps.displayData.iconSrc
  : ownProps.iconUrl;

// TypeScript (use type guards)
const icon =
  'displayData' in ownProps ? ownProps.displayData.iconSrc : ownProps.iconUrl;
```

#### 8. `assertExhaustiveCheck`

Usually used in switch default cases. When switching on a property of an object,
discard that property because the entire object will be the `never` type in TS.

```typescript
// Flow
default:
   throw assertExhaustiveCheck(error.type);

// TypeScript
default:
   throw assertExhaustiveCheck(error);
```

---

## Lessons Learned (Avoid These Mistakes)

### ⚠️ CRITICAL: Snapshot Test Policy

**Never update snapshots (`yarn test -u`) without investigating the root cause of differences.**

**Case Study**: EmptyReasons component conversion initially failed snapshot tests due to curly quote differences (straight quotes `"` vs curved quotes `"` and `"`). This indicated a real rendering difference that needed investigation, not snapshot updates.

**Root Cause**: Claude Code cannot preserve curly quotes in copy/paste operations, causing unintended character changes that affect React rendering.

**Solution Process**:

1. Always investigate snapshot failures - they indicate real differences
2. Compare original vs converted files character-by-character if needed
3. For quote issues: manually copy correct quotes from original file in IDE
4. Verify tests pass before proceeding

**Policy**: Snapshot changes are NEVER acceptable without understanding and validating the underlying cause.

### ❌ FAILED: Global Syntax Changes

**What Failed**: Converting all `+prop:` → `readonly prop:` globally across mixed codebase
**Why**: Flow parser can't handle TypeScript `readonly` keyword in .js files
**Lesson**: Conversion must be per-file during .js → .ts migration

### ❌ FAILED: Utility-First Migration Order

**What Failed**: Starting with utility files before type definitions
**Why**: Utilities import types from src/types/ - creates dependency issues
**Lesson**: Always convert dependencies first (types → utilities → components)

### ✅ SUCCESS: Type-First Strategy

**What Worked**: Converting all 13 type definition files first, then utilities
**Why**: Provides stable foundation, utilities can import converted types
**Result**: Zero compilation errors, smooth dependency resolution

---

## Key Development Commands

- `yarn test` - Run all tests (must pass after each conversion)
- `yarn typecheck` - Check TypeScript compilation for converted files only
- `yarn test-all` - Run all checks (TypeScript + lint + test + etc.)

---

## Migration Strategy

### Phase 1: ✅ COMPLETED - Infrastructure & Type Definitions

- TypeScript configuration established
- All 13 type definition files converted
- Build system supporting mixed codebase

### Phase 2: ✅ COMPLETED - Utility Files

- Target: 40 files in src/utils/
- Current: 40/40 complete (100%)
- All utility files successfully migrated to TypeScript

### Phase 3: 🔄 IN PROGRESS - React Components

- Target: 150+ files in src/components/
- Current: 6/150+ complete (4.0%)
- ✅ Started with simple leaf components (Warning, BlobUrlLink, FooterLinks, EmptyReasons)
- ✅ Successfully converted connected components (DebugWarning, Icon)
- ✅ Established patterns for union type handling with type guards
- Focus: Continue with more leaf components before complex ones

### Phase 4: ⏳ PLANNED - Connected Components

- Add TypeScript types to existing ExplicitConnect patterns
- Create typed versions of selectors and actions
- No API changes during migration

### Phase 5: ⏳ PLANNED - Final Cleanup

- Remove Flow infrastructure (.flowconfig, dependencies)
- Update documentation
- Enable stricter TypeScript settings
