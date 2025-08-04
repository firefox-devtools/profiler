# Flow to TypeScript Migration Plan & Status

## 🎯 CURRENT FOCUS: Phase 4 - `as any` Cleanup (August 2025)

**Status**: All 295 application files converted to TypeScript ✅ Now reducing type escape hatches.

**Current Goal**: Systematically reduce 130 `as any` usages across 50 files to improve type safety.

### Progress Tracking Commands
```bash
yarn track-as-any           # Show current usage and progress
yarn track-as-any --detail  # Show breakdown by file
yarn test-all               # Includes as-any regression check
```

## Priority Files for Cleanup

**High-usage files** (work on these first):
1. `src/profile-logic/import/chrome.tsx` - 18 usages
2. `src/actions/receive-profile.ts` - 9 usages  
3. `src/profile-logic/marker-data.ts` - 8 usages
4. `src/profile-logic/import/art-trace.tsx` - 7 usages
5. `src/components/shared/MarkerContextMenu.tsx` - 7 usages

## Common `as any` Patterns to Fix

### 1. MarkerPayload Union Properties
```typescript
// Current (as any escape hatch)
const data: MarkerPayload = payload as any;
const value = (data as any).specificField;

// Better (type narrowing)
function isSpecificMarker(data: MarkerPayload): data is SpecificMarkerPayload {
  return data.type === 'specific';
}
if (isSpecificMarker(data)) {
  const value = data.specificField; // No as any needed
}
```

### 2. Tree/Selector Type Mismatches
```typescript
// Current
tree={tree as any}

// Better - fix generic constraints
tree={tree as TreeView<MarkerDisplayData>}
```

### 3. Window Extensions
```typescript
// Current  
const ga = (self as any).ga;

// Better
declare global {
  interface Window {
    ga?: GoogleAnalytics;
  }
}
const ga = window.ga;
```

## Remaining Migration Phases

### Phase 5: Test Utilities (Planned)
- Convert test utility files in `src/test/` that use Flow syntax
- Prepare test infrastructure for main test conversion

### Phase 6: Test Files (Planned)  
- Convert 120+ test files from Flow to TypeScript
- Only after all application code is fully type-safe

### Phase 7: Enable Additional Checks (Planned)
- Enable `useUnknownInCatchVariables`
- Enable `alwaysStrict`

## Key Technical Context

### Type System Status
- **TypeScript**: All application code converted (295 files)
- **Flow**: Being phased out (test files still use Flow)
- **Type Coverage**: Reduced due to `as any` usage during migration

### Build Commands
```bash
yarn typecheck    # TypeScript compilation check
yarn test         # Jest tests
yarn lint         # ESLint + Stylelint + Prettier
yarn test-all     # Full validation + as-any check
```

### Architecture
- **React/Redux** web application for Firefox Profiler
- **Core modules**: Profile processing, visualization, symbolication
- **Profile formats**: Gecko, Chrome, Linux perf, Android, etc.

---

**Focus**: Replace `as any` with proper type narrowing, guards, and declarations. Each reduction improves type safety and catches potential runtime errors at compile time.