# Flow to TypeScript Migration TODO

This document tracks specific actionable tasks for the Flow to TypeScript migration. See PLAN.md for the overall strategy and timeline.

## Phase 1: Pre-migration Flow Cleanup

### 1.1 Connected Components Modernization
- [ ] Review and test PR #3063 (Flow connect API)
- [ ] Review and test PR #3064 (TypeScript connect API)
- [ ] Complete any remaining work on the connect API PRs
- [ ] Identify all components using ExplicitConnect (search for `explicitConnect`)
- [ ] Migrate components to use built-in `connect` (start with simple cases)
- [ ] Remove ExplicitConnect utility once all components migrated
- [ ] Verify type safety with both Flow and TypeScript tests

### 1.2 Flow Type System Cleanup
- [ ] **Replace readonly property syntax**: Search for `{+` and replace with `$ReadOnly<>`
  - Estimated ~15 occurrences based on grep results
- [ ] **Replace type spread syntax**: Search for type spreads in object types and replace with intersections
- [ ] **Replace Object and {} types**: 
  - Replace `Object` with `{[key: string]: mixed}`
  - Replace bare `{}` with explicit types
- [ ] **Remove * type usage**: Search for `*` type and replace with `mixed` or specific types
- [ ] **Fix function parameter types**: Find `Type => ReturnType` and change to `(param: Type) => ReturnType`
- [ ] **Fix unnamed object keys**: Find `{[Key]: Value}` and change to `{[key: Key]: Value}`

### 1.3 Higher-Order Components to Hooks Migration
- [ ] **Audit WithSize usage**: Search for `WithSize` and `withSize` 
- [ ] **Audit WithViewport usage**: Search for `WithViewport` and `withViewport`
- [ ] Create `useSize` hook to replace WithSize HOC
- [ ] Create `useViewport` hook to replace WithViewport HOC
- [ ] Migrate components one by one from HOCs to hooks
- [ ] Remove HOC utilities once migration complete

## Phase 2: TypeScript Infrastructure Setup

### 2.1 Build System Configuration
- [ ] **Install TypeScript dependencies**:
  ```bash
  yarn add -D typescript @types/react @types/react-dom @types/jest
  ```
- [ ] **Create tsconfig.json** with appropriate settings:
  - Enable strict mode gradually
  - Configure path mappings to match current webpack aliases
  - Set up incremental compilation
- [ ] **Update webpack config** to handle .ts/.tsx files
- [ ] **Configure Jest** for TypeScript:
  - Install ts-jest or babel preset
  - Update jest.config.js
- [ ] **Update ESLint config** for TypeScript support
- [ ] **Test build pipeline** with a few converted files

### 2.2 Type Definitions and Globals
- [ ] **Install @types packages** for external dependencies:
  - Check current dependencies and find corresponding @types packages
  - Install packages like @types/classnames, @types/react-redux, etc.
- [ ] **Create global.d.ts** with type aliases:
  ```typescript
  type $ReadOnly<T> = Readonly<T>;
  type $Shape<T> = Partial<T>;
  type empty = never;
  type mixed = unknown;
  ```
- [ ] **Convert Flow globals** to TypeScript (.d.ts files)

## Phase 3: Automated Migration

### 3.1 Create Migration Scripts
- [ ] **File renaming script**: Create script to rename .js → .ts/.tsx
- [ ] **Syntax replacement script**: 
  - Replace `{|` with `{` and `|}` with `}`
  - Remove `// @flow` comments
  - Change `import type {` to `import {`
- [ ] **Test scripts** on a small subset of files first

### 3.2 Run Migration Tools
- [ ] **Test flow-to-typescript-codemod** on sample files
- [ ] **Run custom scripts** on entire codebase
- [ ] **Fix compilation errors** from automated changes
- [ ] **Commit automated changes** in phases for easier review

## Phase 4: Manual Migration and Type Fixes

### 4.1 Core Type System (Priority: High)
- [ ] **Fix template constraints**: `<T: Constraint>` → `<T extends Constraint>`
- [ ] **Address exact object types**: Remove Flow-specific exact object syntax
- [ ] **Fix per-thread selectors**: This may require architectural changes
- [ ] **Update union/intersection types** for TypeScript compatibility

### 4.2 React Component Types (Priority: High)
- [ ] **Fix component prop types**: Ensure all props are properly typed
- [ ] **Update Redux connections**: Use new connect API types
- [ ] **Fix event handlers**: Ensure proper React event types
- [ ] **Update refs and component instances**

### 4.3 Profile Logic Types (Priority: Medium)
- [ ] **Profile processing types**: Update complex profile format types
- [ ] **Marker and thread types**: Ensure compatibility
- [ ] **Symbolication types**: Address any issues
- [ ] **Import/export types**: Various profile format handlers

### 4.4 Utility Types (Priority: Low)
- [ ] **Utility function types**: General helper functions
- [ ] **Test helper types**: Testing utilities
- [ ] **Worker types**: Web worker implementations

## Phase 5: Testing and Validation

### 5.1 Type Checking
- [ ] **Achieve zero TypeScript errors**: All files must compile
- [ ] **Configure strict TypeScript settings** gradually
- [ ] **Optimize tsconfig.json** for development speed

### 5.2 Runtime Testing  
- [ ] **Run full test suite**: Ensure no runtime regressions
- [ ] **Manual testing**: Test key profiler functionality
- [ ] **Performance testing**: Check for any regressions

### 5.3 Build Validation
- [ ] **Test production builds**: Ensure webpack bundles correctly
- [ ] **Test development server**: Hot reloading and development tools
- [ ] **Validate all build targets**: Including symbolicator CLI, etc.

## Phase 6: Cleanup

### 6.1 Remove Flow Infrastructure
- [ ] **Remove .flowconfig file**
- [ ] **Remove Flow dependencies** from package.json
- [ ] **Remove Flow scripts** from package.json
- [ ] **Clean up Flow libdefs directory**

### 6.2 Documentation Updates
- [ ] **Update README.md** with TypeScript information
- [ ] **Update CONTRIBUTING.md** with TypeScript guidelines
- [ ] **Update CLAUDE.md** to reflect TypeScript setup
- [ ] **Document TypeScript patterns** used in the project

## Quick Reference Commands

```bash
# Find readonly properties
grep -r "{\+" src/

# Find exact object types  
grep -r "{\|" src/

# Find $ReadOnly usage
grep -r "\$ReadOnly" src/

# Find mixed usage
grep -r "mixed" src/

# Find * type usage  
grep -r ": \*" src/

# Count JavaScript files to migrate
find src -name "*.js" | wc -l
```

## Progress Tracking

- **Total .js files in src/**: ~250 files
- **Files with Flow types**: ~250 files  
- **Complex type definitions**: ~15 files in src/types/
- **React components**: ~150 files
- **Test files**: ~100 files

Track progress by phase completion and file migration counts.