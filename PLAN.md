# Flow to TypeScript Migration Plan & Status

## Current Status (August 3, 2025)

**JavaScript files remaining**: 48 → **TypeScript files**: 247 → **Strict exclude list**: 2 files

- `yarn test-all` passes - All checks work correctly  
- `yarn typecheck` passes - Mixed Flow/TypeScript codebase is stable
- **Strategy**: Dependency-first migration focusing on zero-dependency files first
- **Progress**: 83.7% of files converted, accelerating with large file conversions

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
**Recent conversions (41 files, 12,052 lines)**:
- **Latest session**: 7 large zero-dependency files (3,481 lines) - CallNodeContextMenu, Markers, CallTree, TrackNetwork, etc.
- **Previous session**: window-console.ts strict compliance + AppHeader.tsx
- **Core infrastructure**: merge-compare.ts (1,447 lines), per-thread selectors, profile-view.ts

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
- **Canvas context null safety** - Pattern of `if (!ctx) return;` after `getContext('2d')` calls
- **Timeout handling** - `clearTimeout(timeout | null)` requires null checks: `if (timeout) clearTimeout(timeout)`

### Missing Type Declarations Needed
- **Create declarations for remaining npm dependencies** when encountered during conversions
- **Investigate complex Flow libdefs** in `src/types/libdef/npm*` that may need TypeScript equivalents

### Code Quality Improvements
- **Standardize window property access** - Create utility types for console API extensions like `persistTooltips`
- **Create MarkerPayload type guards** - Replace `(data as any).property` with proper type narrowing functions
- **Canvas context utility** - Helper function for safe canvas context retrieval with null checks
- **Audit remaining `as any` assertions** for potential type safety improvements

## Tooling Improvements Needed

### Conversion Script Enhancements
- **Flow spread syntax auto-fix** - Detect `{ ...TypeA, ...TypeB }` and convert to `TypeA & TypeB` automatically
- **React event generic auto-completion** - Detect `React.MouseEvent<>` and suggest appropriate element types
- **Canvas context null safety injection** - Auto-add null checks after `getContext('2d')` calls
- **Window property access conversion** - Auto-convert `window.property` to `(window as any).property` for non-standard properties
- **Enhanced Flow syntax detection** - Improve handling of complex Flow patterns like `?{...}`, `| null<Type>`, empty generics `<>`

### Development Experience
- **Pre-conversion complexity analysis** - Script to identify potentially problematic files before conversion
- **Batch conversion safety checks** - Validate entire batches before committing to avoid partial failures  
- **Type declaration generator** - Automated Flow libdef → TypeScript declaration conversion tool
- **Progress visualization** - Better reporting of remaining files by complexity/dependency depth

### Quality Assurance
- **Strict compliance checker** - Automated detection of files ready for strict exclude list removal
- **Runtime behavior validator** - Ensure TypeScript conversions maintain identical runtime behavior
- **Performance impact tracking** - Monitor TypeScript compilation times and bundle size changes

## Next Priority Actions

1. **Continue zero-dependency file conversions** - Good momentum with large files, 8 remaining zero-dependency files
2. **Fix 2 remaining strict exclude files**: Root.tsx, UploadedRecordingsHome.tsx  
3. **Create type safety utilities** - MarkerPayload type guards, canvas context helpers, window property types
4. **Implement enhanced conversion script** for Flow spread syntax and React event generics
5. **Continue systematic dependency-first migration** for remaining 48 JavaScript files

---

**Critical Guidelines**: Never change runtime behavior. Always prefer adjusting types over changing code. Test after each conversion. Commit frequently. Keep PLAN.md up-to-date and free of duplication and superfluous detail.