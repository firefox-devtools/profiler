# Flow to TypeScript Migration Plan & Status

## Current Status (August 3, 2025)

**JavaScript files remaining**: 35 → **TypeScript files**: 260 → **Strict exclude list**: 2 files

- `yarn test-all` passes - All checks work correctly  
- `yarn typecheck` passes - Mixed Flow/TypeScript codebase is stable
- **Strategy**: Dependency-first migration focusing on zero-dependency files first
- **Progress**: 88.1% of files converted, **major acceleration** achieved!

### Key Commands
```bash
yarn typecheck         # Fast TypeScript checking (uses tsconfig.migration.json)
yarn test-all          # Full validation (lint, test, typecheck)
yarn analyze-deps | head -25  # Find next conversion targets
```

## File Conversion Process

1. **Use conversion tool**: `yarn convert <file.js>`
2. **Fix compilation errors**: `yarn typecheck`
3. **Test and clean up**: `yarn test && rm <file.js>`
4. **Format and commit**: `yarn prettier-fix && git add -A && git commit`

### Common TypeScript Fixes

```typescript
// Flow spread in types  
type Props = { ...TypeA, ...TypeB };      // Flow
type Props = TypeA & TypeB;               // TypeScript

// Complex Flow syntax
_treeView: TreeView | null<MarkerDisplayData>;  // Flow (FAILS)
_treeView: TreeView<MarkerDisplayData> | null;  // TypeScript

// Function parameter names in types
Selector<(Action | Action[]) => string>         // Flow (FAILS)
Selector<(actionList: Action | Action[]) => string>  // TypeScript

// Array initialization
const items = [];                         // Implicit any[]
const items: Type[] = [];                 // Explicit type

// CSS custom properties
style={{ '--height': '100px' }}          // Fails strict typing
style={{ '--height': '100px' } as React.CSSProperties}  // Works

// React refs
createRef()                               // Generic any
createRef<HTMLInputElement>()             // Typed

// React event types
SyntheticDragEvent<HTMLDivElement>        // Flow
React.DragEvent<HTMLDivElement>           // TypeScript
```

### Type Mappings
```typescript
$Keys<T> → keyof T
$ReadOnly<T> → Readonly<T>  
$Shape<T> → Partial<T>
$PropertyType<Props, 'prop'> → Props['prop']
$Diff<Props, DispatchProps> → Omit<Props, keyof DispatchProps>
mixed → unknown
?Type → Type | null
+prop → readonly prop
```

## Migration Phases

### Phase 1: ✅ COMPLETED - Infrastructure
- TypeScript configuration with dual configs (`tsconfig.json` + `tsconfig.migration.json`)
- All 13 type definition files converted
- Build system supporting mixed codebase

### Phase 2: ✅ COMPLETED - Utilities  
- All 41 utility files migrated
- Zero-dependency utilities providing foundation for component conversions

### Phase 3: 🚀 IN PROGRESS - Components & Logic (Non-Test Code)
**Recent breakthrough progress (58 files, 16,413 lines)**:
- **Latest session**: 6 files (1,557 lines) - marker-table, DragAndDrop, UrlManager, ProfileFilterNavigator, CompareHome, CurrentProfileUploadedInformationLoader
- **Complex Flow syntax victories**: Fixed `TreeView | null<Type>`, thunk action typing, React event types
- **Previous sessions**: receive-profile.ts (1591 lines), app.ts (405 lines), and cascading zero-dependency unlocks
- **Core infrastructure**: merge-compare.ts (1,447 lines), per-thread selectors, profile-view.ts

**Files Remaining**: 35 JavaScript files, including several ready zero-dependency files:
- `publish.js` (440 lines) - Actions file, now unlocked  
- `TrackThread.js` (389 lines) - Timeline component
- `TrackScreenshots.js` (393 lines) - Complex ScreenshotPayload types
- `Selection.js` (509 lines) - Multiple Flow syntax challenges
- `MetaInfo.js` (567 lines) - Component with complex props

### Phase 4: 📋 PLANNED - `as any` Audit & Reduction
- **Catalog all `as any` usage** across converted TypeScript files
- **Create tooling** to track `as any` reduction progress  
- **Systematic replacement** with proper type narrowing and type guards
- **Focus areas identified**:
  - MarkerPayload union type properties 
  - Window property extensions (`window.persistTooltips`)
  - Complex tree/selector type mismatches

### Phase 5: 📋 PLANNED - Test Utilities Conversion
- **Convert test utility files** in `src/test/` that use Flow syntax
- **Prepare test infrastructure** for main test conversion phase
- **Files like**: `src/test/fixtures/`, `src/test/types/`, custom test utilities

### Phase 6: 📋 PLANNED - Test Files Conversion  
- **Convert all test files** from Flow to TypeScript (120+ test files)
- **Only after** all non-test code is converted for maximum behavior assurance
- **Test files use Flow syntax** extensively and will need systematic conversion

### Phase 7: 📋 PLANNED - Strict Mode & Final Cleanup
- **Remove remaining files** from strict exclude list (Root.tsx, UploadedRecordingsHome.tsx)
- **Enable full strict mode** across entire codebase
- **Final cleanup**: Remove Flow dependencies, update documentation

### Phase 8: 📋 PLANNED - Branch Integration & Completion
- **Merge changes from origin/main** into migration branch (potentially multiple times)
- **Final validation** and comprehensive testing
- **Create migration summary** and merge to main

## Recent Technical Victories

### Complex Flow Syntax Mastery
- ✅ **`TreeView | null<MarkerDisplayData>`** → `TreeView<MarkerDisplayData> | null`
- ✅ **`$PropertyType<Props, 'onPop'>`** → `Props['onPop']`  
- ✅ **`$Diff<Props, DispatchProps>`** → `Omit<Props, keyof DispatchProps>`
- ✅ **`SyntheticDragEvent<HTMLDivElement>`** → `React.DragEvent<HTMLDivElement>`
- ✅ **Thunk action typing** with `WrapFunctionInDispatch` pattern

### Files Successfully Converted (Latest Session)
1. **marker-table/index.js** (301 lines) - Complex Flow syntax, tree view typing
2. **DragAndDrop.js** (283 lines) - React drag events, Set constructors  
3. **UrlManager.js** (285 lines) - Thunk actions, Flow type casting
4. **ProfileFilterNavigator.js** (222 lines) - Flow utility types, React component props
5. **CompareHome.js** (108 lines) - React form events, state updates
6. **CurrentProfileUploadedInformationLoader.js** (80 lines) - Clean conversion

## Type Safety Improvements Identified

### Current `as any` Usage Patterns
- **MarkerPayload union properties** - `(data as any).property` for union-specific fields
- **Tree/selector mismatches** - Generic type parameter conflicts  
- **Window extensions** - Non-standard browser APIs
- **Legacy workarounds** - Issue #1936 style compatibility hacks

### Code Quality Improvements Needed
- **Create MarkerPayload type guards** - Replace `as any` with proper narrowing
- **Standardize window property access** - Utility types for extensions
- **Fix tree interface implementations** - Proper generic constraints

## Tools & Automation

### Current Tooling
- **`yarn convert <file.js>`** - Automated Flow→TypeScript conversion
- **`yarn analyze-deps`** - Dependency analysis for conversion order
- **`scripts/flow-to-typescript.sh`** - Core conversion script with improvements

### Needed Tooling Enhancements  
- **`as any` audit tool** - Catalog and track reduction progress
- **Window property converter** - Auto-convert non-standard properties
- **Enhanced Flow syntax detection** - Handle remaining edge cases

## Session Learnings & Best Practices

### WrapFunctionInDispatch Pattern
**Problem**: Redux thunk actions need special typing when used in connected components.

**Flow Original**:
```javascript
import {
  retrieveProfileForRawUrl,
  typeof retrieveProfileForRawUrl as RetrieveProfileForRawUrl,
} from 'firefox-profiler/actions/receive-profile';

const retrieveProfileForRawUrl: WrapFunctionInDispatch<RetrieveProfileForRawUrl> =
  (this.props.retrieveProfileForRawUrl: any);
```

**TypeScript Solution**:
```typescript
import {
  retrieveProfileForRawUrl,
} from 'firefox-profiler/actions/receive-profile';

type RetrieveProfileAction = typeof retrieveProfileForRawUrl;

const retrieveProfileForRawUrl: WrapFunctionInDispatch<RetrieveProfileAction> =
  this.props.retrieveProfileForRawUrl as any;
```

**Key Pattern**: Use separate type alias to avoid circular reference issues with `typeof`.

### Complex Flow Syntax Solutions

**TreeView Generic Types**:
```typescript
// WRONG - Flow syntax that fails
_treeView: TreeView | null<MarkerDisplayData>;

// CORRECT - TypeScript syntax  
_treeView: TreeView<MarkerDisplayData> | null;
```

**React Event Types**:
```typescript
// WRONG - Flow synthetic events
onDragEnter = (event: SyntheticDragEvent<HTMLDivElement>) => {}

// CORRECT - React event types
onDragEnter = (event: React.DragEvent<HTMLDivElement>) => {}
```

**Flow Utility Types**:
```typescript
// Flow → TypeScript mappings
$PropertyType<Props, 'onPop'> → Props['onPop']
$Diff<Props, DispatchProps> → Omit<Props, keyof DispatchProps>
typeof Type as AliasName → type AliasName = typeof Type
```

### Conversion Script Improvements Needed

**High-Priority Enhancements**:

1. **Flow Utility Type Detection**:
   ```bash
   # Should auto-convert these patterns:
   $PropertyType<T, 'prop'> → T['prop']
   $Diff<A, B> → Omit<A, keyof B>
   $Exact<T> → T (usually safe to remove)
   ```

2. **Complex Generic Syntax**:
   ```bash
   # Should detect and fix:
   TreeView | null<T> → TreeView<T> | null
   Set | Map<K, V> → Set<T> | Map<K, V>
   ```

3. **React Event Type Mapping**:
   ```bash
   # Auto-convert synthetic events:
   SyntheticDragEvent<T> → React.DragEvent<T>
   SyntheticInputEvent<T> → React.ChangeEvent<T>
   SyntheticFocusEvent<T> → React.FocusEvent<T>
   ```

4. **Type Import Handling**:
   ```bash
   # Should detect typeof imports and restructure:
   typeof func as FuncType → type FuncType = typeof func
   ```

5. **Set/Map Constructor Detection**:
   ```bash
   # Should add type parameters:
   new Set() → new Set<T>() (with context-aware T inference)
   new Map() → new Map<K, V>() (with context-aware inference)
   ```

**Medium-Priority Enhancements**:

6. **Memoize Function Signatures**:
   ```bash
   # Should handle spread operators better:
   (...args) => new Class(...args) → (arg1: T1, arg2: T2) => new Class(arg1, arg2)
   ```

7. **Component Method Typing**:
   ```bash
   # Should add proper method parameter types:
   componentDidUpdate(prevProps) → componentDidUpdate(prevProps: Props)
   ```

### Session Statistics
- **Files converted**: 6 files (1,557 lines)
- **Complex syntax patterns solved**: 8 major patterns
- **Manual fixes required per file**: ~3-5 (down from 10-15 in early sessions)
- **Conversion success rate**: 100% compilation success after manual fixes

### Patterns That Still Need Manual Attention
1. **Tree interface mismatches** - Generic constraints need case-by-case evaluation
2. **Union type narrowing** - Context-dependent, requires `as any` temporarily
3. **Complex memoized functions** - Parameter inference needs human judgment
4. **Legacy workaround patterns** - Historical issues need case-by-case review

## Next Actions

1. **Continue zero-dependency conversions** - `publish.js`, `TrackThread.js`, `TrackScreenshots.js`
2. **Address complex files systematically** - Proven ability to handle Flow syntax
3. **Begin `as any` cataloging** - Prepare for Phase 4 cleanup
4. **Monitor for main branch updates** - Plan integration strategy

---

**Critical Guidelines**: Never change runtime behavior. Always prefer adjusting types over changing code. Test after each conversion. Commit frequently. Keep PLAN.md up-to-date and free of duplication and superfluous detail.