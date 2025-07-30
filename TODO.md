# Flow to TypeScript Migration TODO

This document tracks specific actionable tasks for the Flow to TypeScript migration. See PLAN.md for the overall strategy and timeline.

## ✅ Phase 1 & 2: Infrastructure and Flow Cleanup - COMPLETED

### 1.1 TypeScript Infrastructure - COMPLETED ✅
- [x] Install TypeScript and related dependencies  
- [x] Create tsconfig.json with appropriate compiler options
- [x] Set up global type compatibility layer (src/global.d.ts)
- [x] Verify build system works with TypeScript files

### 1.2 Flow Type System Cleanup - PARTIALLY COMPLETED
- [x] **Replace exact object syntax**: Converted 1,132 instances of `{||}` → `{}`
- [ ] **Replace readonly property syntax**: Search for `{+` and replace with `$ReadOnly<>`
  - Estimated ~1,881 occurrences found
- [ ] **Replace type spread syntax**: Search for type spreads in object types and replace with intersections
- [ ] **Replace Object and {} types**: 
  - Replace `Object` with `{[key: string]: mixed}`
  - Replace bare `{}` with explicit types
- [ ] **Remove * type usage**: Search for `*` type and replace with `mixed` or specific types
- [ ] **Fix function parameter types**: Find `Type => ReturnType` and change to `(param: Type) => ReturnType`
- [ ] **Fix unnamed object keys**: Find `{[Key]: Value}` and change to `{[key: Key]: Value}`

## 🔄 Phase 3: File-by-File Migration - IN PROGRESS

### 3.1 Core Utilities Migration (Priority: High)
- [ ] **Convert simple utilities first**: `src/utils/string.js`, `src/utils/colors.js`, etc.
- [ ] **Test compilation**: `npx tsc --noEmit` passes for converted files
- [ ] **Test imports**: Ensure other files can import from .ts files
- [ ] **Run existing tests**: Validate no runtime regressions

### 3.2 Type Definitions Migration (Priority: High)  
- [ ] **Convert type files**: `src/types/*.js` → `.ts`
- [ ] **Fix Flow-specific syntax**: Template constraints, import types, etc.
- [ ] **Test IDE support**: Ensure better autocomplete and error detection
- [ ] **Validate component imports**: Components can import types correctly

### 3.3 Simple Components Migration (Priority: Medium)
- [ ] **Start with leaf components**: No Redux connections, simple props
- [ ] **Convert .js → .tsx**: Add proper React component types
- [ ] **Fix prop types**: Proper TypeScript interfaces for props/state
- [ ] **Test component rendering**: All existing tests still pass

### 3.4 Connected Components Migration (Priority: Medium)
- [ ] **Identify ExplicitConnect usage**: Search codebase for patterns
- [ ] **Add TypeScript types**: Create typed selectors and action creators
- [ ] **Migrate component by component**: Add proper typing to existing patterns
- [ ] **No API changes**: Keep existing ExplicitConnect, just add types

## ⏳ Phase 4: Advanced Type System Fixes

### 4.1 Flow-Specific Syntax Cleanup (Priority: High)
- [ ] **Fix template constraints**: `<T: Constraint>` → `<T extends Constraint>`
- [ ] **Clean up import type statements**: Remove Flow-specific imports
- [ ] **Fix function type syntax**: Arrow function parameter types
- [ ] **Address remaining readonly properties**: Convert to `$ReadOnly<>` wrapper

### 4.2 Complex Type Patterns (Priority: High)
- [ ] **Per-thread selectors**: Manual migration with possible architectural changes
- [ ] **Complex generic constraints**: Fix advanced type parameter usage
- [ ] **Union/intersection type fixes**: Ensure TypeScript compatibility
- [ ] **Profile processing types**: Handle complex format union types

### 4.3 Connected Components Advanced Typing (Priority: Medium)
- [ ] **Typed selectors**: Ensure all selectors have proper return types
- [ ] **Action creator types**: Add proper typing to all actions
- [ ] **State shape validation**: Ensure Redux state types are accurate
- [ ] **Component connection testing**: Verify typed connections work correctly

## ⏳ Phase 5: Final Validation and Testing

### 5.1 Type System Validation
- [ ] **Achieve zero TypeScript compilation errors**: All files must compile cleanly
- [ ] **Enable stricter TypeScript settings**: Gradually increase strictness
- [ ] **Performance testing**: Monitor TypeScript compilation impact on build times

### 5.2 Runtime and Integration Testing  
- [ ] **Full test suite validation**: All existing tests must continue to pass
- [ ] **Manual testing**: Verify key profiler functionality works correctly
- [ ] **Build target testing**: Production builds, dev server, symbolicator CLI

## ⏳ Phase 6: Flow Infrastructure Removal

### 6.1 Clean Up Flow Remnants
- [ ] **Remove .flowconfig file**
- [ ] **Remove Flow dependencies** from package.json (flow-bin, etc.)
- [ ] **Remove Flow scripts** from package.json (flow, flow:ci)
- [ ] **Clean up Flow libdefs directory** (src/types/libdef)

### 6.2 Documentation and Process Updates
- [ ] **Update CLAUDE.md**: Reflect TypeScript development setup
- [ ] **Update build commands**: Replace flow commands with TypeScript equivalents
- [ ] **Document migration**: Record lessons learned and patterns established

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