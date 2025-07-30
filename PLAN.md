# Flow to TypeScript Migration Plan & Status

## Current Status (July 30, 2025)

### 🎉 MAJOR MILESTONE ACHIEVED!

**ALL UTILITY FILES SUCCESSFULLY MIGRATED TO TYPESCRIPT** ✅

This represents a significant achievement in the Flow→TypeScript migration:

- **100% of utility files converted** (41/41 files)
- **Complex Flow features successfully translated** including `$ObjMap`, `$Call`, generic bounds
- **All tests continue to pass** - no functionality broken during migration
- **Advanced type safety maintained** with proper TypeScript equivalents

### 📊 Progress Summary

- **Type Definitions**: ✅ 13/13 files complete (100%)
- **Core Utilities**: ✅ 41/41 files complete (100%)  
- **React Components**: ✅ 16/150+ files complete (10.7%) - Warning.tsx, BlobUrlLink.tsx, FooterLinks.tsx, DebugWarning.tsx, EmptyReasons.tsx, Icon.tsx, ContextMenuTrigger.tsx, ContextMenuNoHidingOnEnter.tsx, UploadedRecordingsHome.tsx, TransformNavigator.tsx, TrackEventDelay.tsx, JsTracerEmptyReasons.tsx, CodeLoadingOverlay.tsx, ProfileMetaInfoSummary.tsx, MarkerTableEmptyReasons.tsx, MarkerChartEmptyReasons.tsx
- **Profile Logic**: ⏳ 0/80+ files - Core business logic modules
- **Build System**: ✅ Mixed Flow/TypeScript support working correctly

### 🎯 Immediate Next Steps

**Priority**: Continue React component migration with simple leaf components before tackling complex profile-logic modules.

**Target Components** (simple, minimal dependencies):
1. Simple presentational components in `src/components/shared/`
2. Small utility components with few props
3. Components with minimal external dependencies

**Avoid for now**: 
- Profile-logic modules (complex business logic)
- Complex connected components with many selectors
- Components with heavy Canvas/WebGL usage

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

#### 9. React Component Props Types

```typescript
// Flow
import type { ElementProps } from 'react';
type Props = ElementProps<typeof Component>;

// TypeScript
import { ComponentProps } from 'react';
type Props = ComponentProps<typeof Component>;
```

#### 10. CSS Custom Properties (CSS Variables)

```typescript
// TypeScript - CSS custom properties need type assertion
<div
  style={{
    height: graphHeight,
    '--graph-height': `${graphHeight}px`,
    '--markers-height': `0px`,
  } as React.CSSProperties}
>
```

#### 11. Specific Type Imports

```typescript
// Sometimes generic imports don't work
import { CodeLoadingSource } from 'firefox-profiler/types'; // ❌ May fail

// Use specific import paths
import { CodeLoadingSource } from 'firefox-profiler/types/state'; // ✅ Works
```

#### 12. Empty Reasons Connected Component Pattern

```typescript
// Common pattern for empty state components
type StateProps = {
  readonly threadName: string;
  readonly isEmptyInFullRange: boolean;
};

type Props = ConnectedProps<{}, StateProps, {}>;
class EmptyReasonsImpl extends PureComponent<Props> {
  override render() {
    const { isEmptyInFullRange, threadName } = this.props;
    return (
      <EmptyReasons
        threadName={threadName}
        reason={isEmptyInFullRange ? 'No data' : 'Filtered out'}
        viewName="view-name"
      />
    );
  }
}

export const ComponentEmptyReasons = explicitConnect<{}, StateProps, {}>({
  mapStateToProps: (state: State) => ({
    threadName: selectedThreadSelectors.getFriendlyThreadName(state),
    isEmptyInFullRange: selectedThreadSelectors.getSomeEmptyCheck(state),
  }),
  component: EmptyReasonsImpl,
});
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
- Current: 16/150+ complete (10.7%)
- ✅ Successfully converted simple leaf components (Warning, BlobUrlLink, FooterLinks, EmptyReasons)
- ✅ Successfully converted connected components (DebugWarning, Icon, TransformNavigator)
- ✅ Established patterns for union type handling with type guards
- ✅ Converted EmptyReasons pattern components (JsTracer, MarkerTable, MarkerChart)
- ✅ Function components with complex union types (CodeLoadingOverlay)
- Focus: Continue with more leaf components before complex ones

### Phase 4: ⏳ PLANNED - Connected Components

- Add TypeScript types to existing ExplicitConnect patterns
- Create typed versions of selectors and actions
- No API changes during migration

### Phase 5: ⏳ PLANNED - Final Cleanup

- Remove Flow infrastructure (.flowconfig, dependencies)
- Update documentation
- Enable stricter TypeScript settings
