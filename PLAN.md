# Flow to TypeScript Migration Plan & Status

## 🎯 CURRENT FOCUS: Phase 5 - Test Utility Conversion (August 2025)

**Status**: Application code conversion complete ✅ `as any` cleanup achieved ✅ Ready for test utilities.

**Phase 4 Completed**: Successfully reduced `as any` usage from 130 → 66 usages (49% reduction) across 50 → 28 files.

**Current Goal**: Convert test utility files from Flow to TypeScript to enable full test suite migration.

### Progress Tracking Commands
```bash
yarn analyze-deps          # Show conversion progress and dependency analysis
yarn track-as-any          # Monitor type safety progress (66 usages remaining)
yarn test-all              # Full validation including tests
```

## Current Priority: Test Utility Files

**Ready for conversion** (24 independent files):
1. `src/test/fixtures/mocks/` - Mock implementations (8 files)
2. `src/test/types/` - Type utilities (2 files) 
3. `src/test/fixtures/profiles/` - Test profiles (4 files)
4. `src/test/fixtures/` - Test helpers (10 files)

**Conversion Strategy**: Start with smallest mock files, then utilities, then larger profile fixtures.

## Test Utility Conversion Guidelines

### Key Considerations
1. **Flow Types → TypeScript**: Convert Flow syntax (`// @flow`, `type Props = {...}`)
2. **Import/Export**: Update module syntax to TypeScript standards
3. **Type Definitions**: Add proper TypeScript type annotations
4. **Jest/Testing Types**: Ensure compatibility with testing framework types

### Conversion Patterns
```typescript
// Flow (before)
// @flow
import type { Profile } from '../types/profile';

// TypeScript (after) 
import type { Profile } from '../types/profile';
// Note: Remove @flow, keep import type syntax
```

### Mock File Strategy
- Start with simple mocks (file-mock.js, style-mock.js) 
- Progress to complex mocks (canvas-context.js, web-channel.js)
- Ensure all mocks maintain their testing functionality

## Remaining Migration Phases

### Phase 6: Test Files (Next)  
- Convert 120+ test files from Flow to TypeScript
- Depends on completing test utility conversion first
- Will enable full TypeScript test coverage

### Phase 7: Enhanced Type Safety (Final)
- Continue reducing remaining `as any` usages (66 → 0)
- Enable `useUnknownInCatchVariables`
- Enable `alwaysStrict` 
- Remove Flow entirely from the codebase

## Key Technical Context

### Type System Status
- **TypeScript**: All application code converted (297 files)
- **Flow**: Being phased out (32 test utility files remaining)  
- **Type Coverage**: Significantly improved (49% reduction in `as any` usage)

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

**Focus**: Convert test utility files from Flow to TypeScript. This enables conversion of the main test suite and moves us toward complete TypeScript migration.