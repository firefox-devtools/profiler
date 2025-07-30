# Flow to TypeScript Migration Status

This document tracks the current status of the Flow to TypeScript migration. It describes completed steps, ongoing work, and next actions.

## Migration Planning Phase - COMPLETED ✅

**Completed:** January 2025

### Accomplishments
- ✅ **Codebase Analysis**: Analyzed existing Flow usage patterns and identified migration challenges
- ✅ **Issue Research**: Reviewed GitHub issue #2931 and related PRs (#3063, #3064) for context and prior work
- ✅ **Migration Strategy**: Created comprehensive PLAN.md with 6-phase incremental approach
- ✅ **Task Planning**: Detailed actionable tasks in TODO.md with priorities and estimates
- ✅ **Risk Assessment**: Identified high-risk areas (per-thread selectors, Redux connections) and mitigation strategies

### Key Findings
- **Scale**: ~250 JavaScript files with Flow types to migrate
- **Complexity**: Heavy use of Flow-specific features like exact objects `{||}`, readonly props `{+prop}`, and `$ReadOnly<>`
- **Architecture**: Complex Redux/React patterns with custom ExplicitConnect utility
- **Timeline**: Estimated 8-13 weeks for complete migration
- **Approach**: Incremental migration with Flow cleanup first, then TypeScript infrastructure, then automated conversion

### Critical Dependencies Identified
- **PR #3063** (Flow connect API) and **PR #3064** (TypeScript connect API) need completion
- Connected components modernization is prerequisite for smooth migration
- Higher-order components (WithSize, WithViewport) should be migrated to hooks first

## Current Status: Ready to Begin Phase 1

### Next Immediate Actions
1. **Review and finalize PR #3063 and #3064** - Critical for connected component migration
2. **Begin Flow cleanup tasks** as outlined in TODO.md Phase 1.2
3. **Set up TypeScript infrastructure** in parallel (Phase 2)

### Migration Readiness Assessment

| Component | Status | Risk Level | Notes |
|-----------|--------|------------|-------|
| **Connected Components** | ⚠️ Blocked | High | Waiting on PR #3063/#3064 completion |
| **Flow Type Cleanup** | ✅ Ready | Medium | Can begin immediately |
| **HOC → Hooks Migration** | ✅ Ready | Medium | WithSize/WithViewport identified |
| **Build System** | ✅ Ready | Low | TypeScript can be added incrementally |
| **Per-thread Selectors** | ⚠️ Unknown | High | May require architectural changes |

### Estimated Progress Tracking

**Phase 1 - Pre-migration Flow Cleanup** (Target: 2-3 weeks)
- [ ] 0% - Connected components modernization (blocked on PRs)
- [ ] 0% - Flow type system cleanup (~50 specific changes identified)
- [ ] 0% - HOC to hooks migration (~2 HOCs to convert)

**Phase 2 - TypeScript Infrastructure** (Target: 1 week)  
- [ ] 0% - Build system configuration
- [ ] 0% - Type definitions and globals

**Phase 3 - Automated Migration** (Target: 1-2 weeks)
- [ ] 0% - Migration scripts creation
- [ ] 0% - Automated conversion execution

**Phase 4 - Manual Migration** (Target: 3-4 weeks)
- [ ] 0% - Core type system fixes
- [ ] 0% - React component types
- [ ] 0% - Profile logic types  
- [ ] 0% - Utility types

**Phase 5 - Testing & Validation** (Target: 1-2 weeks)
- [ ] 0% - Type checking resolution
- [ ] 0% - Runtime testing
- [ ] 0% - Build validation

**Phase 6 - Cleanup** (Target: 1 week)
- [ ] 0% - Flow infrastructure removal
- [ ] 0% - Documentation updates

## Migration Statistics

### Current Codebase (Flow)
- **Total .js files in src/**: ~250 files
- **Files with Flow types**: ~250 files (nearly all)
- **Complex type definitions**: 15 files in src/types/
- **React components**: ~150 files
- **Test files**: ~100 files
- **Flow-specific patterns found**:
  - Exact objects `{||}`: ~50+ occurrences
  - Readonly properties `{+prop}`: ~15 occurrences  
  - `$ReadOnly<>` usage: ~10 occurrences
  - `mixed` type usage: ~20 occurrences

### Target Codebase (TypeScript)
- **Target file extensions**: .ts for utilities, .tsx for React components
- **Expected TypeScript strictness**: Gradual adoption, starting with basic types
- **Type definition strategy**: Global aliases for Flow→TypeScript compatibility during transition

## Risks and Blockers

### Current Blockers
1. **PR #3063/#3064 Status**: Connected component modernization depends on these PRs
2. **Team Availability**: Migration requires coordinated effort from core team
3. **Feature Development Pause**: May need to pause major features during intensive migration phases

### Ongoing Risk Monitoring
- **Per-thread Selectors**: Complex generic types may not translate cleanly to TypeScript
- **Third-party Dependencies**: Some libraries may lack good TypeScript definitions
- **Build Performance**: TypeScript compilation may impact development build times
- **Testing Coverage**: Need to ensure no runtime regressions during migration

## Next Steps (Immediate - Next 1-2 weeks)

1. **Assess PR #3063/#3064 status** and determine completion timeline
2. **Begin Phase 1.2 Flow cleanup** tasks that don't depend on connected components:
   - Replace readonly property syntax `{+prop}` → `$ReadOnly<{prop}>`
   - Replace exact object syntax `{||}` → `{}`
   - Clean up `mixed` and `*` type usage
3. **Set up TypeScript infrastructure** in parallel:
   - Install TypeScript dependencies
   - Create initial tsconfig.json
   - Test build pipeline with sample files
4. **Create migration scripts** for automated syntax conversion

## Success Metrics

- [ ] Zero TypeScript compilation errors
- [ ] All existing tests pass  
- [ ] No runtime regressions in core profiler functionality
- [ ] Development and production builds work correctly
- [ ] Team productivity maintained during migration

## Documentation Status

- ✅ **PLAN.md**: Comprehensive migration strategy completed
- ✅ **TODO.md**: Detailed actionable tasks with priorities
- ✅ **STATUS.md**: Current status tracking (this document)
- ⏳ **CLAUDE.md**: Will need updates to reflect TypeScript development setup

---

**Last Updated**: January 2025  
**Next Status Update**: After Phase 1 completion or significant blockers resolved
