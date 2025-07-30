# Flow to TypeScript Migration Plan & Status

## Current Status (July 30, 2025)

### 📊 Progress
- **Type Definitions**: ✅ 13/13 files complete (100%)
- **Core Utilities**: 🔄 11/40+ files complete (28%) - colors.ts, string.ts, format-numbers.ts, errors.ts, base64.ts, bisect.ts, pretty-bytes.ts, sha1.ts, set.ts, magic.ts, analytics.ts, l10n-pseudo.ts
- **React Components**: ⏳ 0/150+ files (pending)
- **Build System**: ✅ Mixed Flow/TypeScript support working correctly

### 🎯 Next Steps
1. Continue converting remaining ~29 utility files in src/utils/
2. Begin React component migration with simple leaf components
3. Maintain test validation after each conversion

---

## Critical Process (Prevents Mistakes)

### File Conversion Steps - MUST FOLLOW IN ORDER
1. Copy `.js` → `.ts/.tsx`
2. Remove `// @flow`
3. Apply conversion patterns (see below)
4. **CRITICAL**: Test compilation: `npx tsc --noEmit --skipLibCheck file.ts`
5. **CRITICAL**: Fix ALL compilation errors before proceeding
6. Only after successful compilation, remove original `.js` file
7. Run tests to ensure no regressions

### Proven Flow→TypeScript Conversion Patterns

#### 1. Import Statements
```typescript
// Flow
import type { SomeType } from './module';

// TypeScript
import { SomeType } from './module';
```

#### 2. Readonly Properties
```typescript
// Flow
type Example = {
  +prop: string,
};

// TypeScript
type Example = {
  readonly prop: string,
};
```

#### 3. Nullable Types
```typescript
// Flow
prop: ?string,
array: Array<?number>,

// TypeScript  
prop: string | null,
array: Array<number | null>,
```

#### 4. Flow Utility Types
```typescript
// Flow → TypeScript
$Keys<T> → keyof T
$Values<T> → T[keyof T]  
$ReadOnly<T> → Readonly<T>
$Shape<T> → Partial<T>
$PropertyType<T, 'prop'> → T['prop']
mixed → unknown
```

#### 5. Set Operations (Important Fix)
```typescript
// Flow (causes TS errors)
return new Set([...set1].filter(x => set2.has(x)));

// TypeScript (correct)
return new Set(Array.from(set1).filter(x => set2.has(x)));
```

#### 6. Function Types
```typescript
// Flow
type Fn = ('send', GAPayload) => void;

// TypeScript
type Fn = (command: 'send', payload: GAPayload) => void;
```

---

## ✅ RESOLVED: Build System Configuration

**Problem**: Babel was not correctly handling mixed Flow/TypeScript files.

**Solution**: Migrated from `babel.config.json` to `babel.config.js` with proper file-based overrides:

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    overrides: [
      {
        test: /\.jsx?$/,  // Flow files
        presets: [
          ["@babel/preset-env", { useBuiltIns: "usage", corejs: "3.9", bugfixes: true }],
          ["@babel/preset-react", { useSpread: true }],
          ["@babel/preset-flow", { all: true }]
        ]
      },
      {
        test: /\.tsx?$/,  // TypeScript files
        presets: [
          ["@babel/preset-env", { useBuiltIns: "usage", corejs: "3.9", bugfixes: true }],
          ["@babel/preset-react", { useSpread: true }],
          ["@babel/preset-typescript", { isTSX: true, allExtensions: true }]
        ]
      }
    ]
  };
};
```

---

## Lessons Learned (Avoid These Mistakes)

### ❌ FAILED: Global Syntax Changes
**What Failed**: Converting all `+prop:` → `readonly prop:` globally across mixed codebase
**Why**: Flow parser can't handle TypeScript `readonly` keyword in .js files
**Lesson**: Conversion must be per-file during .js → .ts migration

### ❌ FAILED: Utility-First Migration Order  
**What Failed**: Starting with utility files before type definitions
**Why**: Utilities import types from src/types/ - creates dependency issues
**Lesson**: Always convert dependencies first (types → utilities → components)

### ✅ SUCCESS: Type-First Strategy
**What Worked**: Converting all 13 type definition files first, then utilities
**Why**: Provides stable foundation, utilities can import converted types
**Result**: Zero compilation errors, smooth dependency resolution

---

## Key Files & Commands

### Development Commands
- `yarn test` - Run all tests (must pass after each conversion)
- `npx tsc --noEmit --skipLibCheck` - Test TypeScript compilation
- `yarn build` - Development build (not needed for conversion)

### Critical Configuration Files
- `tsconfig.json` - TypeScript configuration (working correctly)
- `babel.config.js` - Mixed Flow/TypeScript support (resolved)
- `jest.config.js` - Test configuration (supports .ts/.tsx)

### Current TypeScript Configuration
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowJs": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": false,
    "noImplicitReturns": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  }
}
```

---

## Migration Strategy

### Phase 1: ✅ COMPLETED - Infrastructure & Type Definitions  
- TypeScript configuration established
- All 13 type definition files converted
- Build system supporting mixed codebase

### Phase 2: 🔄 IN PROGRESS - Utility Files
- Target: ~40 files in src/utils/
- Current: 11/40+ complete (28%)
- Focus: Simple, self-contained files first

### Phase 3: ⏳ PLANNED - React Components
- Start with leaf components (no complex Redux connections)
- Convert to .tsx with proper React types
- Validate props, state, and event handlers

### Phase 4: ⏳ PLANNED - Connected Components  
- Add TypeScript types to existing ExplicitConnect patterns
- Create typed versions of selectors and actions
- No API changes during migration

### Phase 5: ⏳ PLANNED - Final Cleanup
- Remove Flow infrastructure (.flowconfig, dependencies)
- Update documentation
- Enable stricter TypeScript settings