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
- [ ] Replace readonly property syntax `{+prop: Type}` with `$ReadOnly<{prop: Type}>` (~1,881 instances remaining)
- [ ] Replace type spread `{...A, ...B}` with intersection types `A & B`
- [ ] Replace `Object` and `{}` types with explicit `{[key: string]: mixed}` and `{[key: string]: empty}`
- [ ] Remove all usage of the `*` type (replace with `mixed` or specific types)
- [ ] Fix named function arguments: `Error => void` → `(error: Error) => void`
- [ ] Fix unnamed object keys: `{[ThreadsKey]: Type}` → `{[key: ThreadsKey]: Type}`

### Phase 3: File-by-File Migration (IN PROGRESS)

**Goal**: Convert individual files from .js to .ts/.tsx while maintaining functionality.

#### 3.1 Core Utilities Migration
- [ ] Convert `src/utils/*.js` to `.ts` (start with simple utility functions)
- [ ] Test TypeScript compilation and imports work correctly
- [ ] Validate existing functionality is preserved

#### 3.2 Type Definitions Migration  
- [ ] Convert `src/types/*.js` to `.ts` (provides better IDE support)
- [ ] Fix Flow-specific syntax issues for TypeScript
- [ ] Ensure components can import these types correctly

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
- ⏳ **Phase 4**: 2-3 weeks (Advanced type fixes)
- ⏳ **Phase 5**: 1-2 weeks (Testing & validation)
- ⏳ **Phase 6**: 1 week (Final cleanup)

## Implementation Notes

### Incremental Approach

The migration follows a proven incremental strategy:
1. ✅ **Infrastructure First**: TypeScript build system established without disrupting Flow
2. ✅ **Syntax Compatibility**: Flow exact objects converted to TypeScript-compatible syntax  
3. 🔄 **File-by-File**: Individual .js → .ts/.tsx conversion with immediate validation
4. ⏳ **Advanced Types**: Complex patterns addressed after basic migration

### Connected Components Strategy

**Decision**: Proceed with existing `ExplicitConnect` patterns rather than waiting for API modernization
- **Benefits**: Removes external dependency, allows immediate progress
- **Approach**: Add TypeScript types to existing patterns, refactor connect API later
- **Risk**: Manageable - existing patterns work, just need proper typing

### Testing Strategy

- ✅ **Continuous Validation**: All tests pass throughout migration process
- 🔄 **Per-File Verification**: Each converted file tested before proceeding
- **Dual Support**: Maintain Flow compatibility until migration complete

## Resources and References

- [GitHub Issue #2931](https://github.com/firefox-devtools/profiler/issues/2931)
- [PR #3063 - Flow connect API](https://github.com/firefox-devtools/profiler/pull/3063)
- [PR #3064 - TypeScript connect API](https://github.com/firefox-devtools/profiler/pull/3064)
- [Flow to TypeScript Migration Guide](https://react-typescript-cheatsheet.netlify.app/docs/migration/from_flow)
- [Stripe's flow-to-typescript-codemod](https://github.com/stripe-archive/flow-to-typescript-codemod)