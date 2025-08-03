# Flow to TypeScript Migration Plan & Status

## Current Status (August 3, 2025)

**JavaScript files remaining**: 40 → **TypeScript files**: 255 → **Strict exclude list**: 2 files

- `yarn test-all` passes - All checks work correctly  
- `yarn typecheck` passes - Mixed Flow/TypeScript codebase is stable
- **Strategy**: Dependency-first migration focusing on zero-dependency files first
- **Progress**: 86.4% of files converted, **major acceleration** achieved!

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
```

### Type Mappings
```typescript
$Keys<T> → keyof T
$ReadOnly<T> → Readonly<T>  
$Shape<T> → Partial<T>
mixed → unknown
?Type → Type | null
+prop → readonly prop
```

## Migration Status

### Phase 1: ✅ COMPLETED - Infrastructure
- TypeScript configuration with dual configs (`tsconfig.json` + `tsconfig.migration.json`)
- All 13 type definition files converted
- Build system supporting mixed codebase

### Phase 2: ✅ COMPLETED - Utilities
- All 41 utility files migrated

### Phase 3: 🚀 IN PROGRESS - Components & Logic
**Recent conversions (52 files, 14,856 lines)**:
- **🔥 BREAKTHROUGH SESSION**: 8 files (2,344 lines) - **receive-profile.ts** (1591 lines) and **app.ts** (405 lines) were game-changers!
- **Unlocked cascade**: receive-profile.ts conversion unlocked 6+ zero-dependency files including TabSelectorMenu, zipped-profiles, ProfileLoader
- **Previous achievements**: 7 large zero-dependency files (3,481 lines) - CallNodeContextMenu, Markers, CallTree, TrackNetwork, etc.
- **Core infrastructure**: merge-compare.ts (1,447 lines), per-thread selectors, profile-view.ts, window-console.ts strict compliance

### Phase 4: ✅ LARGELY COMPLETED - Strict Compliance  
- Reduced strict exclude list from 14 → 2 files (window-console.ts fixed)
- Fixed critical infrastructure files (publish.ts, profile-view.ts, window-console.ts)
- Created type declarations: react-splitter-layout, array-range, simpleperf_report, call-tree

## Deferred Tasks & Issues

### Complex Files Needing Special Handling  
- **marker-table/index.js** (301 lines) - Flow type annotation parsing issues with `TreeView | null<Type>` syntax
- **TrackScreenshots.js** (393 lines) - Complex ScreenshotPayload union types, missing windowWidth/windowHeight properties
- **Selection.js** (509 lines) - Multiple Flow syntax issues: `?{...}` nullable object syntax, empty generic `<>` calls
- **ListOfPublishedProfiles.js** (273 lines) - Dual component classes with separate state definitions causing type inference conflicts

### Type Safety Improvements Identified This Session
- **MarkerPayload union type properties** - Many files need `(data as any).property` for union-specific properties like `cause`, `innerWindowID`, `module`, `name`
- **Window property extensions** - `window.persistTooltips` pattern needs consistent typing approach
- **Timeout handling** - `clearTimeout(timeout | null)` requires null checks: `if (timeout) clearTimeout(timeout)`

### Missing Type Declarations Needed
- **Create declarations for remaining npm dependencies** when encountered during conversions
- **Investigate complex Flow libdefs** in `src/types/libdef/npm*` that may need TypeScript equivalents

### Code Quality Improvements
- **Standardize window property access** - Create utility types for console API extensions like `persistTooltips`
- **Create MarkerPayload type guards** - Replace `(data as any).property` with proper type narrowing functions
- **Audit remaining `as any` assertions** for potential type safety improvements

## Tooling Enhancements Needed
- **Window property access conversion** - Auto-convert `window.property` to `(window as any).property` for non-standard properties
- **Enhanced Flow syntax detection** - Improve handling of complex Flow patterns like `?{...}`, `| null<Type>`, empty generics `<>`

## Breakthrough Session Results ⚡

**Major Accomplishments**:
- **receive-profile.ts** (1591 lines): The most complex actions file - conquered Flow→TypeScript issues including `MixedObject` → `unknown`, union type narrowing, thunk dispatch patterns
- **app.ts** (405 lines): Core app actions with complex track initialization and `as const` action types
- **Cascade effect**: These conversions unlocked 6+ additional zero-dependency files instantly

**Technical Victories**:
- Mastered complex Flow syntax: `$Shape` → `Partial`, `MixedObject` → `unknown`
- Solved union type narrowing with strategic type assertions
- Fixed Redux thunk action typing patterns
- Systematic `as const` application for action type literals

**Remaining Zero-Dependency Files Ready**:
- `publish.js` (440 lines) - Now unlocked and ready
- `MetaInfo.js` (567 lines) - Component with complex props
- Complex files: `TrackContextMenu.js`, `marker-table/index.js`, `TrackScreenshots.js`, `Selection.js`

## Next Priority Actions

1. **Continue the momentum** - Convert `publish.js` and other newly unlocked zero-dependency files  
2. **Tackle complex files systematically** with confidence - proven ability to handle Flow syntax issues
3. **Fix 2 remaining strict exclude files**: Root.tsx, UploadedRecordingsHome.tsx  
4. **Final push** - Only 40 JavaScript files remaining (down from 48!)

---

**Critical Guidelines**: Never change runtime behavior. Always prefer adjusting types over changing code. Test after each conversion. Commit frequently. Keep PLAN.md up-to-date and free of duplication and superfluous detail.