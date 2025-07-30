# Flow to TypeScript Migration Plan & Status

This document provides a comprehensive guide for migrating the Firefox Profiler from Flow to TypeScript. It includes the overall strategy, current progress status, proven conversion patterns, and actionable next steps. The migration is designed to be incremental, allowing the project to maintain functionality throughout the transition.

## Current Status (July 30, 2025)

### 🎯 Major Achievements
- **✅ MAJOR MILESTONE**: All type definition files (13/13) successfully converted to TypeScript
- **✅ Complex Type Mastery**: Handled advanced Flow patterns in 890-line markers.ts and 572-line gecko-profile.ts
- **✅ Zero Compilation Errors**: All converted files compile successfully with TypeScript
- **✅ Modern Configuration**: Updated to 2025 TypeScript standards with enhanced migration support
- **✅ Proven Conversion Patterns**: Systematic approach for Flow→TypeScript migration established
- **✅ Utility Migration Progress**: Significant progress on utility file conversion with robust testing validation

### 📊 Current Progress
- **Type Definitions**: ✅ 13/13 files complete (100%)
- **Core Utilities**: 🔄 11/40+ files complete (28%) - colors.ts, string.ts, format-numbers.ts, errors.ts, base64.ts, bisect.ts, pretty-bytes.ts, sha1.ts, set.ts, magic.ts, analytics.ts, l10n-pseudo.ts
- **React Components**: ⏳ 0/150+ files (pending)
- **Build System**: ✅ Mixed Flow/TypeScript support resolved - Babel correctly handles both syntaxes

### 🎯 Next Actions
1. **Continue utility file conversion** - Target simple files with fewer dependencies first
2. **Begin leaf component migration** - Start with simple React components without complex Redux connections
3. **Maintain testing validation** - Ensure all tests pass after each conversion

### 🏗️ Build & Test Status
- **Build**: 🔄 Import resolution updates needed for converted .ts files (expected during migration)
- **Tests**: ✅ All pass (`yarn test` - full test suite) with mixed Flow/TypeScript syntax
- **Flow**: ⚠️ Some expected errors due to ongoing migration
- **TypeScript**: ✅ Compiles successfully for all .ts/.tsx files
- **Babel**: ✅ Mixed syntax support working - .js files use Flow preset, .ts/.tsx files use TypeScript preset

---

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

### Phase 3: File-by-File Migration (IN PROGRESS - MAJOR MILESTONE ACHIEVED)

**Goal**: Convert individual files from .js to .ts/.tsx while maintaining functionality.

**Strategy Proven**: Type-first migration approach successfully completed - all 13/13 type definition files converted ✅

#### 3.1 Type Definitions Migration (COMPLETED ✅)
- [x] Convert `src/types/units.js` → `units.ts` ✅
- [x] Convert `src/types/utils.js` → `utils.ts` ✅  
- [x] Convert `src/types/store.js` → `store.ts` ✅
- [x] Convert `src/types/index.js` → `index.ts` ✅
- [x] Convert `src/types/actions.js` → `actions.ts` ✅ (691 lines, complex Redux types)
- [x] Convert `src/types/state.js` → `state.ts` ✅ (395 lines, complete app state)
- [x] Convert `src/types/profile.js` → `profile.ts` ✅
- [x] Convert `src/types/profile-derived.js` → `profile-derived.ts` ✅
- [x] Convert `src/types/transforms.js` → `transforms.ts` ✅
- [x] Convert `src/types/symbolication.js` → `symbolication.ts` ✅
- [x] Convert `src/types/indexeddb.js` → `indexeddb.ts` ✅
- [x] Convert `src/types/markers.js` → `markers.ts` ✅ (890 lines, complex marker types)
- [x] Convert `src/types/gecko-profile.js` → `gecko-profile.ts` ✅ (572 lines, Gecko profile format)
- [x] **ALL 13/13 type definition files successfully converted and compiling** ✅

#### 3.2 Core Utilities Migration (IN PROGRESS)
- [x] Convert `src/utils/colors.js` → `colors.ts` ✅ (Photon color constants)
- [x] Convert `src/utils/string.js` → `string.ts` ✅ (URL sanitization utilities)
- [x] Convert `src/utils/format-numbers.js` → `format-numbers.ts` ✅ (Number formatting with localization)
- [x] Convert `src/utils/errors.js` → `errors.ts` ✅ (Error types and TemporaryError class)
- [x] Convert `src/utils/base64.js` → `base64.ts` ✅ (ArrayBuffer/base64 utilities)
- [x] Convert `src/utils/bisect.js` → `bisect.ts` ✅ (Binary search algorithms with typed arrays)
- [ ] Convert remaining ~34 utility files in src/utils/
- [x] Test TypeScript compilation and imports work correctly
- [x] Validate existing functionality is preserved

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
- 🔄 **Phase 3**: File-by-file migration - IN PROGRESS  
  - ✅ **Type definitions: 13/13 files converted** - MAJOR MILESTONE COMPLETED ✅
  - 🔄 **Core utilities: 3/40+ files converted** (colors.ts, string.ts, format-numbers.ts)
  - ⏳ Remaining: ~37 utility files, ~150 React components
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

#### 7. Flow Utility Types (Additional Patterns)
```typescript
// Flow
type Values = $Values<SomeObject>;
type ObjMap = $ObjMap<SomeObject, ExtractType>;
type Exact = $Exact<SomeType>;

// TypeScript
type Values = SomeObject[keyof SomeObject];
type ObjMap = { [K in keyof SomeObject]: ExtractType<SomeObject[K]> };
type Exact = SomeType; // Often can be removed
```

#### 8. Nullable Type Variants
```typescript
// Flow - nullable at start of type
type Example = {
  prop: ?number,
  optional?: ?string,
};

// TypeScript
type Example = {
  prop: number | null,
  optional?: string | null,
};
```

#### 9. Trailing Commas in Types (CRITICAL)
```typescript
// Flow - allows trailing commas in some contexts
type Example = {
  prop1: string,
  prop2: number,
}; // ← This comma causes TypeScript errors in some contexts

// TypeScript - remove trailing commas
type Example = {
  prop1: string,
  prop2: number
}; // ← No trailing comma
```

#### 10. CommonJS Import Compatibility (NEW PATTERN)
```typescript
// Flow - works with various import styles
import escapeStringRegexp from 'escape-string-regexp';

// TypeScript - requires esModuleInterop for default imports from CommonJS
import escapeStringRegexp from 'escape-string-regexp'; // ✅ Works with esModuleInterop: true

// Alternative if needed:
import * as escapeStringRegexp from 'escape-string-regexp';
```

#### 11. Complex Flow Utility Types (ADVANCED PATTERNS)
```typescript
// Flow
export type $ReplaceCauseWithStack<T: Object> = {
  ...$Diff<T, { cause: any }>,
  stack?: GeckoMarkerStack,
};

// TypeScript
export type ReplaceCauseWithStack<T extends Record<string, unknown>> = Omit<T, 'cause'> & {
  stack?: GeckoMarkerStack,
};
```

#### 12. Array Type Variations (NEW PATTERN)
```typescript
// Flow
data: $ReadOnlyArray<[number, number, number]>

// TypeScript
data: readonly [number, number, number][]
```

### Conversion Process (Per File) - REVISED
1. Copy `.js` → `.ts`
2. Remove `// @flow`
3. Convert imports: `import type` → `import`
4. Apply readonly properties: `+prop:` → `readonly prop:`
5. Convert nullable types: `?Type` → `Type | null`
6. Fix Flow utility types: `$Values<T>` → `T[keyof T]`, `$ReadOnly<T>` → `Readonly<T>`, `mixed` → `unknown`
7. Fix trailing commas in type definitions
8. **CRITICAL**: Test compilation: `npx tsc --noEmit --skipLibCheck file.ts`
9. **CRITICAL**: Fix ALL compilation errors before proceeding
10. Only after successful compilation, remove original `.js` file
11. Mark file as "converted" only after error-free compilation

### Success Metrics
- **All Type Definitions**: 13/13 files, including complex 890-line markers.ts and 572-line gecko-profile.ts ✅
- **Core Utilities Progress**: 11/40+ files (28% complete) - Added pretty-bytes.ts, sha1.ts, set.ts, magic.ts, analytics.ts, l10n-pseudo.ts ✅
- **Jest Configuration**: Updated to support .ts/.tsx extensions ✅
- **Babel TypeScript Support**: @babel/preset-typescript installed ✅
- **Pattern Reliability**: Proven conversion patterns work consistently across different file types ✅
- **Zero Compilation Errors**: All converted files compile successfully with TypeScript ✅
- **Test Suite Validation**: All tests continue to pass with mixed Flow/TypeScript codebase ✅

## ✅ RESOLVED: Babel Configuration for Mixed Codebase

### Problem Solved (July 30, 2025)
**Issue**: Babel overrides not working correctly for mixed Flow/TypeScript codebase
- TypeScript preset was being applied to `.js` files with Flow syntax
- Flow preset was being applied to `.ts` files with TypeScript syntax  
- Jest tests failing due to incorrect parser selection

### Solution Implemented
**Root Cause**: The babel.config.json overrides configuration was not properly isolating Flow and TypeScript presets due to JSON limitations and regex pattern issues.

**Fix**: Migrated from `babel.config.json` to `babel.config.js` with proper file-based overrides:

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    overrides: [
      {
        test: /\.jsx?$/,  // Flow files (.js, .jsx)
        presets: [
          ["@babel/preset-env", { useBuiltIns: "usage", corejs: "3.9", bugfixes: true }],
          ["@babel/preset-react", { useSpread: true }],
          ["@babel/preset-flow", { all: true }]
        ]
      },
      {
        test: /\.tsx?$/,  // TypeScript files (.ts, .tsx)
        presets: [
          ["@babel/preset-env", { useBuiltIns: "usage", corejs: "3.9", bugfixes: true }],
          ["@babel/preset-react", { useSpread: true }],
          ["@babel/preset-typescript", { isTSX: true, allExtensions: true }]
        ]
      }
    ],
    plugins: [/* existing plugins preserved */]
  };
};
```

### Verification Results ✅
- **Flow files (.js/.jsx)**: Parse correctly with Flow syntax (`+readonly:`, `?Type`, `(param: any)`)
- **TypeScript files (.ts)**: Parse correctly with TypeScript syntax (`readonly`, `Type | null`, `unknown`)
- **TypeScript React files (.tsx)**: Parse correctly with JSX and TypeScript
- **Jest tests**: Full test suite passes (all tests successful)
- **Mixed syntax support**: Confirmed working in both test and build environments

### Impact Resolution ✅
- **Unblocks further utility file migration** - Babel now correctly handles mixed syntax
- **TypeScript imports work in test environment** - Jest properly processes .ts/.tsx files
- **Build system ready** - Webpack can now process both Flow and TypeScript files correctly

### Next Steps Enabled
1. Continue converting utility files from .js to .ts (babel configuration supports this)
2. Begin leaf component migration with confidence in build tooling
3. Import resolution updates needed for converted files (expected build behavior)

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

### TypeScript Configuration Strategy (NEW LESSON)
**What Was Done**: Updated tsconfig.json to 2025 TypeScript standards with enhanced migration support
**Key Improvements**:
- **ES2022 target** with modern module resolution
- **noImplicitReturns: true** - catches Flow-style function return issues
- **Enhanced esModuleInterop** - better CommonJS import compatibility
- **JSON Schema reference** - improved IDE support

**Result**: SUCCESSFUL - Better error detection, improved import handling, modern TypeScript features
**Evidence**: Caught import compatibility issues in string.ts that previous config missed
**Lesson**: Modern TypeScript configuration significantly improves migration experience and error detection

## Resources and References

- [GitHub Issue #2931](https://github.com/firefox-devtools/profiler/issues/2931)
- [PR #3063 - Flow connect API](https://github.com/firefox-devtools/profiler/pull/3063)
- [PR #3064 - TypeScript connect API](https://github.com/firefox-devtools/profiler/pull/3064)
- [Flow to TypeScript Migration Guide](https://react-typescript-cheatsheet.netlify.app/docs/migration/from_flow)
- [Stripe's flow-to-typescript-codemod](https://github.com/stripe-archive/flow-to-typescript-codemod)