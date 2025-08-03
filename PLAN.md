# Flow to TypeScript Migration Plan & Status

## Current Status (August 3, 2025)

**JavaScript files remaining**: 56 → **TypeScript files**: 239 → **Strict exclude list**: 3 files

- `yarn test-all` passes - All checks work correctly  
- `yarn typecheck` passes - Mixed Flow/TypeScript codebase is stable
- **Strategy**: Dependency-first migration focusing on zero-dependency files first

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
**Recent conversions (34 files, 8,571 lines)**:
- **Latest session**: BottomBox.tsx (306 lines) + 2 strict compliance fixes
- **Previous session**: 10 components (1,376 lines) - TrackCustomMarker, ProfileName, StackSettings, etc.
- **Core infrastructure**: merge-compare.ts (1,447 lines), per-thread selectors, profile-view.ts

### Phase 4: ✅ LARGELY COMPLETED - Strict Compliance  
- Reduced strict exclude list from 14 → 3 files
- Fixed critical infrastructure files (publish.ts, profile-view.ts)
- Created type declarations: react-splitter-layout, array-range, simpleperf_report, call-tree

## Deferred Tasks & Issues

### Complex Files Needing Special Handling
- **marker-table/index.js** (301 lines) - Flow type annotation parsing issues with `TreeView | null<Type>` syntax
- **TrackScreenshots.js** (393 lines) - Complex ScreenshotPayload union types, missing windowWidth/windowHeight properties
- **Selection.js** (509 lines) - Multiple Flow syntax issues: `?{...}` nullable object syntax, empty generic `<>` calls
- **ListOfPublishedProfiles.js** (273 lines) - Dual component classes with separate state definitions causing type inference conflicts

### Missing Type Declarations Needed
- **Create declarations for remaining npm dependencies** when encountered during conversions
- **Investigate complex Flow libdefs** in `src/types/libdef/npm*` that may need TypeScript equivalents

### Code Quality Improvements
- **Standardize CSS custom property typing** - Create utility type for consistent `as React.CSSProperties` usage
- **Review dual state definitions** in components - may indicate architectural issues to address
- **Audit remaining `as any` assertions** for potential type safety improvements

## Tooling Improvements Needed

### Conversion Script Enhancements
- **Enhanced Flow syntax detection** - Improve handling of complex Flow patterns like `?{...}`, `| null<Type>`, empty generics `<>`
- **Better union type conversion** - Automated detection and conversion of complex payload unions
- **Dual class detection** - Handle files with multiple React components more intelligently
- **CSS property type insertion** - Automatically add `as React.CSSProperties` for style objects with custom properties

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

1. **Tackle simpler 0-dependency files first** - Avoid complex ones until tooling improvements  
2. **Create remaining type declarations** as needed during conversions
3. **Fix 3 remaining strict exclude files**: Root.tsx, UploadedRecordingsHome.tsx, window-console.ts
4. **Implement enhanced conversion script** for complex Flow syntax patterns
5. **Continue systematic dependency-first migration** for remaining 56 JavaScript files

---

**Critical Guidelines**: Never change runtime behavior. Always prefer adjusting types over changing code. Test after each conversion. Commit frequently. Keep PLAN.md up-to-date and free of duplication and superfluous detail.