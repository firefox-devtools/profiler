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

### Phase 1: Pre-migration Flow Cleanup (Estimated: 2-3 weeks)

**Goal**: Modify Flow code to be more compatible with TypeScript patterns, reducing the complexity of the actual migration.

#### 1.1 Connected Components Modernization
- [ ] Complete and land PR #3063 (Flow connect API) and #3064 (TypeScript connect API)
- [ ] Migrate all connected components to use built-in `connect` instead of `ExplicitConnect`
- [ ] Remove the custom `ExplicitConnect` machinery
- [ ] Verify type safety with both Flow and TypeScript tests

#### 1.2 Flow Type System Cleanup
- [ ] Replace readonly property syntax `{+prop: Type}` with `$ReadOnly<{prop: Type}>`
- [ ] Replace type spread `{...A, ...B}` with intersection types `A & B`
- [ ] Replace `Object` and `{}` types with explicit `{[key: string]: mixed}` and `{[key: string]: empty}`
- [ ] Remove all usage of the `*` type (replace with `mixed` or specific types)
- [ ] Fix named function arguments: `Error => void` → `(error: Error) => void`
- [ ] Fix unnamed object keys: `{[ThreadsKey]: Type}` → `{[key: ThreadsKey]: Type}`

#### 1.3 Higher-Order Components to Hooks Migration
- [ ] Migrate `WithSize` HOC to `useSize` hook
- [ ] Migrate `WithViewport` HOC to `useViewport` hook
- [ ] Update all components using these HOCs

### Phase 2: TypeScript Infrastructure Setup (Estimated: 1 week)

#### 2.1 Build System Configuration
- [ ] Install TypeScript and related dependencies
- [ ] Create `tsconfig.json` with appropriate compiler options
- [ ] Update webpack configuration to handle `.ts` and `.tsx` files
- [ ] Configure Jest to work with TypeScript files
- [ ] Update linting configuration (ESLint with TypeScript rules)

#### 2.2 Type Definitions and Globals
- [ ] Install `@types` packages for all external dependencies
- [ ] Create global type aliases in `.d.ts` files:
  - `$ReadOnly<T>` → `Readonly<T>`
  - `$Shape<T>` → `Partial<T>`
  - `empty` → `never`
  - `mixed` → `unknown`
- [ ] Migrate Flow global type definitions to TypeScript

### Phase 3: Automated Migration (Estimated: 1-2 weeks)

#### 3.1 File System Changes
- [ ] Create migration scripts for:
  - Renaming `.js` files to `.ts`/`.tsx`
  - Replacing `{|` with `{` and `|}` with `}`
  - Removing `// @flow` comments
  - Changing `import type {` to `import {`
  - Basic Flow→TypeScript syntax transforms

#### 3.2 Run Migration Tools
- [ ] Test [flow-to-typescript-codemod](https://github.com/stripe-archive/flow-to-typescript-codemod) on a subset of files
- [ ] Run custom migration scripts
- [ ] Address remaining syntax errors from automated conversion

### Phase 4: Manual Migration and Type Fixes (Estimated: 3-4 weeks)

#### 4.1 Core Type System
- [ ] Fix template constraint syntax: `<T: Constraint>` → `<T extends Constraint>`
- [ ] Replace exact object types with regular object types
- [ ] Fix union and intersection type syntax
- [ ] Address `per-thread` selector type issues (may require architectural changes)

#### 4.2 React Component Types
- [ ] Fix React component prop types and state types
- [ ] Update Redux connection types using new connect API
- [ ] Fix event handler types and refs

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
   - *Mitigation*: May require architectural redesign or simplified typing

2. **Redux Connection Types**: Complex mapping between state/dispatch/props
   - *Mitigation*: Use the modernized connect API prepared in Phase 1

3. **Profile Processing**: Complex union types for different profile formats
   - *Mitigation*: Incremental migration with extensive testing

4. **Build System Integration**: Webpack/Jest configuration complexity
   - *Mitigation*: Thorough testing in isolated environment first

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

**Total Estimated Duration: 8-13 weeks**

- Phase 1: 2-3 weeks
- Phase 2: 1 week  
- Phase 3: 1-2 weeks
- Phase 4: 3-4 weeks
- Phase 5: 1-2 weeks
- Phase 6: 1 week

## Implementation Notes

### Incremental Approach

The migration is designed to be incremental:
1. Flow cleanup makes the codebase more TypeScript-compatible while maintaining Flow compatibility
2. Infrastructure setup can be done in parallel with ongoing development
3. Automated migration can be run on subsets of files
4. Manual fixes can be done iteratively

### Testing Strategy

- Maintain dual Flow/TypeScript testing during Phase 1
- Use feature flags or branches for experimental TypeScript code
- Extensive integration testing before removing Flow support

### Team Coordination

- This migration affects the entire codebase and should involve all core team members
- Consider pausing major feature development during Phases 3-5
- Regular checkpoints and team reviews of migration progress

## Resources and References

- [GitHub Issue #2931](https://github.com/firefox-devtools/profiler/issues/2931)
- [PR #3063 - Flow connect API](https://github.com/firefox-devtools/profiler/pull/3063)
- [PR #3064 - TypeScript connect API](https://github.com/firefox-devtools/profiler/pull/3064)
- [Flow to TypeScript Migration Guide](https://react-typescript-cheatsheet.netlify.app/docs/migration/from_flow)
- [Stripe's flow-to-typescript-codemod](https://github.com/stripe-archive/flow-to-typescript-codemod)