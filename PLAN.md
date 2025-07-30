# Flow to TypeScript Migration Plan

This document outlines a comprehensive plan for migrating the Firefox Profiler from Flow to TypeScript. The migration is designed to be incremental, allowing the project to maintain functionality throughout the transition.

## Executive Summary

Based on analysis of the codebase and GitHub issue #2931, this migration involves:
- ~250 JavaScript files with Flow types
- Complex Redux/React patterns with custom connection utilities
- Extensive use of Flow-specific features like exact object types `{||}`, readonly properties `{+prop}`, and `$ReadOnly<>`
- Complex profile processing logic with union types and intersection types
- Per-thread selectors that may need redesign

## Migration Strategy

### Phase 1 & 2: Infrastructure and Flow Cleanup (COMPLETED ✅)

**Goal**: Set up TypeScript infrastructure and clean up Flow syntax for compatibility.

#### 1.1 TypeScript Infrastructure Setup
- [x] Install TypeScript and related dependencies
- [x] Create tsconfig.json with incremental migration settings
- [x] Set up global type compatibility layer (src/global.d.ts)
- [x] Verify build system works with TypeScript files

#### 1.2 Flow Type System Cleanup
- [x] Replace exact object types `{||}` with regular objects `{}` (1,132 instances converted)
- [x] **APPROACH CHANGED**: Readonly properties now handled per-file during .js → .ts conversion
- [ ] Replace type spread `{...A, ...B}` with intersection types `A & B` (per-file conversion)
- [ ] Replace `Object` and `{}` types with explicit types (per-file conversion)
- [ ] Remove all usage of the `*` type (per-file conversion)
- [ ] Fix named function arguments (per-file conversion)
- [ ] Fix unnamed object keys (per-file conversion)

**Lesson Learned**: Global Flow syntax changes don't work in mixed codebase - must be done per-file.

### Phase 3: File-by-File Migration (IN PROGRESS)

**Goal**: Convert individual files from .js to .ts/.tsx while maintaining functionality.

**Strategy Revised**: Start with type definitions first to build foundation.

#### 3.1 Type Definitions Migration (IN PROGRESS)
- [x] Convert `src/types/units.js` → `units.ts` ✅
- [x] Convert `src/types/utils.js` → `utils.ts` ✅  
- [x] Convert `src/types/store.js` → `store.ts` ✅
- [x] Convert `src/types/index.js` → `index.ts` ✅
- [ ] **Next**: Convert remaining complex type files (actions.js, state.js, etc.)
- [ ] Handle Flow-specific patterns: `$ReadOnly`, `$Call`, etc.
- [ ] Validate all imports work from converted files

#### 3.2 Core Utilities Migration
- [ ] Convert `src/utils/*.js` to `.ts` (build on type foundation)
- [ ] Start with simple utility functions without complex dependencies
- [ ] Test TypeScript compilation and imports work correctly
- [ ] Validate existing functionality is preserved

#### 3.3 Component Migration
- [ ] Start with simple leaf components (no complex Redux connections)
- [ ] Convert `.js` to `.tsx` with proper React types
- [ ] Validate props, state, and event handlers work correctly

#### 3.4 Connected Components Migration
- [ ] Add TypeScript types to existing `ExplicitConnect` patterns (no API changes)
- [ ] Create typed versions of selectors and actions they use
- [ ] Test Redux connections work correctly with TypeScript

### Phase 4: Advanced Type System Fixes (Estimated: 2-3 weeks)

#### 4.1 Flow-Specific Syntax Cleanup
- [ ] Fix template constraint syntax: `<T: Constraint>` → `<T extends Constraint>`
- [ ] Replace remaining readonly properties with `$ReadOnly<>` wrapper
- [ ] Fix union and intersection type syntax where needed
- [ ] Clean up `import type` statements

#### 4.2 Complex Type Patterns
- [ ] Address `per-thread` selector type issues (may require architectural changes)
- [ ] Fix complex generic types and constraints
- [ ] Handle Flow utility types that don't translate directly

#### 4.3 Profile Logic Types
- [ ] Update complex profile processing types
- [ ] Fix marker and thread types
- [ ] Address symbolication types
- [ ] Update import/export types for different profile formats

#### 4.4 Utility and Infrastructure Types
- [ ] Fix utility function types
- [ ] Update test helper types
- [ ] Address worker and async types

### Phase 5: Testing and Validation (Estimated: 1-2 weeks)

#### 5.1 Type Checking
- [ ] Ensure all files pass TypeScript compilation
- [ ] Fix any remaining type errors
- [ ] Optimize `tsconfig.json` for strictness vs. migration speed

#### 5.2 Runtime Testing
- [ ] Verify all existing tests pass
- [ ] Run full test suite including integration tests
- [ ] Manual testing of key profiler functionality
- [ ] Performance regression testing

#### 5.3 Build System Validation
- [ ] Verify production builds work correctly
- [ ] Test development server functionality
- [ ] Validate code splitting and bundling

### Phase 6: Cleanup and Documentation (Estimated: 1 week)

#### 6.1 Remove Flow Infrastructure
- [ ] Remove Flow configuration (`.flowconfig`)
- [ ] Remove Flow dependencies from `package.json`
- [ ] Remove Flow scripts from build process
- [ ] Clean up Flow libdefs directory

#### 6.2 Documentation Updates
- [ ] Update README with TypeScript development instructions
- [ ] Update CONTRIBUTING.md with TypeScript guidelines
- [ ] Document any new TypeScript-specific patterns
- [ ] Update developer documentation

## Risk Assessment and Mitigation

### High Risk Areas

1. **Per-thread Selectors**: Complex generic types that may not translate well
   - *Mitigation*: Manual migration with careful testing and possible architectural changes

2. **Redux Connection Types**: Complex mapping between state/dispatch/props  
   - *Mitigation*: Migrate existing `ExplicitConnect` patterns as-is, add proper TypeScript types

3. **Profile Processing**: Complex union types for different profile formats
   - *Mitigation*: Incremental file-by-file migration with extensive testing

### Resolved Risk Areas

4. **Build System Integration**: ✅ **RESOLVED** - TypeScript fully integrated and working

### Medium Risk Areas

1. **Third-party Library Types**: Some libraries may not have good TypeScript support
2. **Worker Types**: Web Worker type definitions may need special handling
3. **Performance Impact**: TypeScript compilation may slow development builds

## Success Criteria

- [ ] All JavaScript files successfully converted to TypeScript
- [ ] Zero TypeScript compilation errors
- [ ] All existing tests pass
- [ ] No runtime regressions in key functionality
- [ ] Development and production builds work correctly
- [ ] Code maintains or improves type safety

## Timeline

**Total Estimated Duration: 6-8 weeks** (Updated based on progress)

- ✅ **Phase 1 & 2**: COMPLETED (Infrastructure + Flow cleanup)
- 🔄 **Phase 3**: 2-3 weeks (File-by-file migration) - IN PROGRESS  
  - 🔄 Type definitions: 8/14 files converted (units, utils, store, index, actions, state, profile, profile-derived)
  - ⏳ Remaining: 6 type files, utilities, components
- ⏳ **Phase 4**: 2-3 weeks (Advanced type fixes)
- ⏳ **Phase 5**: 1-2 weeks (Testing & validation)
- ⏳ **Phase 6**: 1 week (Final cleanup)

## Implementation Notes

### Incremental Approach

The migration follows a proven incremental strategy:
1. ✅ **Infrastructure First**: TypeScript build system established without disrupting Flow
2. ✅ **Syntax Compatibility**: Flow exact objects converted to TypeScript-compatible syntax  
3. 🔄 **Type-First Migration**: Start with type definitions to build foundation
4. 🔄 **File-by-File**: Individual .js → .ts/.tsx conversion with immediate validation
5. ⏳ **Advanced Types**: Complex patterns addressed after basic migration

**Key Insight**: Type definitions first, then utilities, then components - provides stable foundation.

### Connected Components Strategy

**Decision**: Proceed with existing `ExplicitConnect` patterns rather than waiting for API modernization
- **Benefits**: Removes external dependency, allows immediate progress
- **Approach**: Add TypeScript types to existing patterns, refactor connect API later
- **Risk**: Manageable - existing patterns work, just need proper typing

### Testing Strategy

- ✅ **Continuous Validation**: All tests pass throughout migration process
- 🔄 **Per-File Verification**: Each converted file tested before proceeding
- **Dual Support**: Maintain Flow compatibility until migration complete

## Flow → TypeScript Conversion Patterns

### Core Syntax Conversions (Proven Patterns)

Based on successful conversion of actions.ts and state.ts, here are the reliable patterns:

#### 1. Readonly Properties
```typescript
// Flow
export type Example = {
  +prop: string,
  +optional?: number,
};

// TypeScript
export type Example = {
  readonly prop: string,
  readonly optional?: number,
};
```
**Command**: `sed 's/+\\([a-zA-Z_][a-zA-Z0-9_]*\\):/readonly \\1:/g'`

#### 2. Nullable Types
```typescript
// Flow
type Example = {
  prop: ?string,
  array: Array<?number>,
};

// TypeScript  
type Example = {
  prop: string | null,
  array: Array<number | null>,
};
```
**Commands**: 
- `sed 's/?\\([A-Z][a-zA-Z0-9_]*\\)/\\1 | null/g'`
- `sed 's/Array<?\\([^>]*\\)>/Array<\\1 | null>/g'`

#### 3. Flow Utility Types
```typescript
// Flow
type Keys = $Keys<SomeType>;
type Partial = $Shape<SomeType>;
type Property = $PropertyType<SomeType, 'prop'>;
type ReadOnly = $ReadOnly<SomeType>;

// TypeScript
type Keys = keyof SomeType;
type Partial = Partial<SomeType>;
type Property = SomeType['prop'];
type ReadOnly = Readonly<SomeType>;
```

#### 4. Import Statements
```typescript
// Flow
import type { SomeType } from './module';
import type JSZip from 'jszip';

// TypeScript
import { SomeType } from './module';
import * as JSZip from 'jszip';  // for CJS modules
```

#### 5. Object Spread in Types
```typescript
// Flow
type Extended = {
  ...BaseType,
  newProp: string,
};

// TypeScript  
type Extended = BaseType & {
  newProp: string,
};
```

#### 6. Mixed Type
```typescript
// Flow
type Example = {
  prop: mixed,
};

// TypeScript
type Example = {
  prop: unknown,
};
```

### Conversion Process (Per File)
1. Copy `.js` → `.ts`
2. Remove `// @flow`
3. Convert imports: `import type` → `import`
4. Apply readonly properties: `+prop:` → `readonly prop:`
5. Convert nullable types: `?Type` → `Type | null`
6. Fix Flow utility types
7. Test compilation: `npx tsc --noEmit --skipLibCheck file.ts`
8. Remove original `.js` file

### Success Metrics
- **actions.ts**: 691 lines, complex Redux types, compiles with zero errors
- **state.ts**: 395 lines, complete app state, compiles with zero errors
- **Pattern Reliability**: Same regex patterns work across different file types

## Lessons Learned from Failed Approaches

### Global Readonly Property Conversion (FAILED)
**What Was Tried**: Converting 1,795 `+prop:` → `readonly prop:` instances globally across all files
**Approach**: Used regex replacement script to convert Flow readonly syntax to TypeScript
**Result**: FAILED - Flow parser couldn't handle TypeScript `readonly` keyword in .js files
**Root Cause**: Mixed codebase with both Flow (.js) and TypeScript (.ts) files
**Lesson**: Global syntax changes don't work in mixed codebases - conversion must be per-file

### Utility-First Migration (REVISED → VALIDATED)
**Original Plan**: Start file conversion with `src/utils/*.js` files
**Issue**: Utility files import types from `src/types/*.js` files
**Proven Approach**: Start with type definitions first, then utilities ✅
**Evidence**: Successfully converted actions.ts (691 lines) and state.ts (395 lines) with zero compilation errors
**Lesson**: Dependencies matter - convert foundation files (types) before dependent files

## Resources and References

- [GitHub Issue #2931](https://github.com/firefox-devtools/profiler/issues/2931)
- [PR #3063 - Flow connect API](https://github.com/firefox-devtools/profiler/pull/3063)
- [PR #3064 - TypeScript connect API](https://github.com/firefox-devtools/profiler/pull/3064)
- [Flow to TypeScript Migration Guide](https://react-typescript-cheatsheet.netlify.app/docs/migration/from_flow)
- [Stripe's flow-to-typescript-codemod](https://github.com/stripe-archive/flow-to-typescript-codemod)