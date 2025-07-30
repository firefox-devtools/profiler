# Flow to TypeScript Migration Plan & Status

## Current Status (July 30, 2025)

### 🎉 MAJOR MILESTONE ACHIEVED!

**ALL UTILITY FILES SUCCESSFULLY MIGRATED TO TYPESCRIPT** ✅

This represents a significant achievement in the Flow→TypeScript migration:

- **100% of utility files converted** (41/41 files)
- **Complex Flow features successfully translated** including `$ObjMap`, `$Call`, generic bounds
- **All tests continue to pass** - no functionality broken during migration
- **Advanced type safety maintained** with proper TypeScript equivalents

### 📊 Progress

- **Type Definitions**: ✅ 13/13 files complete (100%)
- **Core Utilities**: ✅ 40/40 files complete (100%) - colors.ts, string.ts, format-numbers.ts, errors.ts, base64.ts, bisect.ts, pretty-bytes.ts, sha1.ts, set.ts, magic.ts, analytics.ts, l10n-pseudo.ts, path.ts, time-code.ts, number-series.ts, jwt.ts, shorten-url.ts, uintarray-encoding.ts, range-set.ts, special-paths.ts, string-table.ts, window-console.ts, css-geometry-tools.ts, gz.ts, react.ts, flow.ts, index.ts, codemirror-shared.ts, data-table-utils.ts, resize-observer-wrapper.ts, text-measurement.ts, url.ts, l10n-ftl-functions.ts, query-api.ts, worker-factory.ts, **mocks**/worker-factory.ts, fetch-assembly.ts, untar.ts, fetch-source.ts, connect.ts
- **React Components**: ✅ 4/150+ files started (2.7%) - Warning.tsx, BlobUrlLink.tsx, FooterLinks.tsx, DebugWarning.tsx
- **Build System**: ✅ Mixed Flow/TypeScript support working correctly

### 🎯 Next Steps

1. ✅ **COMPLETED**: All utility files migrated (100%)!
   - Successfully converted complex connect.js with advanced Flow features
   - All 41 utility files now use TypeScript
2. ✅ **IN PROGRESS**: React component migration started (4 components complete)
   - Successfully converted simple presentational and connected components
   - Proven patterns for TypeScript component conversions established
3. Continue React component migration with more leaf components
4. Maintain test validation after each conversion

### ✅ Current Migration State

- `yarn test-all` **PASSES** - All checks work correctly during migration
- `yarn typecheck` validates all converted TypeScript files
- Mixed Flow/TypeScript codebase is stable and tested

## TypeScript Configuration Setup

### Dual Configuration Strategy

This project uses **two separate TypeScript configurations** to handle the mixed Flow/TypeScript migration:

#### 1. `tsconfig.json` (Primary Config)
- **Purpose**: Full project configuration with Flow compatibility
- **Key settings**:
  - `"allowJs": true` - Allows TypeScript to process `.js` files when imported by `.ts` files
  - `"include": ["src/**/*.ts", "src/**/*.tsx", "src/global.d.ts"]` - Only explicitly includes TypeScript files
  - **Important**: Due to `allowJs: true`, when TypeScript processes `.ts` files that import `.js` files, it will also type-check those `.js` files and fail on Flow annotations

#### 2. `tsconfig.migration.json` (Migration-Specific Config)
- **Purpose**: Safe type checking during migration process  
- **Extends**: `tsconfig.json` but overrides key settings
- **Key settings**:
  - `"allowJs": false` - Completely ignores `.js` files
  - `"exclude": ["src/**/*.js", "src/**/*.jsx"]` - Explicitly excludes all JavaScript files
  - **Result**: Only checks actual TypeScript files, avoiding Flow annotation errors

### Commands & Usage

```bash
# Migration-safe type checking (recommended during development)
yarn typecheck  # Uses tsconfig.migration.json

# Full project type checking (use when migration is complete)  
yarn typecheck-all  # Uses default tsconfig.json
```

### About `--skipLibCheck` Flag

The `--skipLibCheck` flag in commands **does not affect** the `.js` file errors from Flow annotations. It only:
- Skips type checking of `.d.ts` declaration files (in `node_modules`, etc.)
- Provides performance benefits
- Is safe to remove but commonly kept as standard practice

**The real protection** from Flow annotation errors comes from using `tsconfig.migration.json` which excludes `.js` files entirely.

### Webpack Configuration

The webpack configuration has been updated to support TypeScript module resolution:
- Added `extensions: ['.js', '.jsx', '.ts', '.tsx']` for extensionless imports
- Added webpack rule to process `.ts`/`.tsx` files through babel-loader
- Enables `yarn build` to properly resolve TypeScript files

---

## Critical Process (Prevents Mistakes)

### File Conversion Steps - MUST FOLLOW IN ORDER

1. Copy `.js` → `.ts/.tsx`
2. Remove `// @flow`
3. Apply conversion patterns (see below)
4. **CRITICAL**: Test compilation: `yarn typecheck` (project-wide is fastest)
5. **CRITICAL**: Fix ALL compilation errors before proceeding
6. Only after successful compilation, remove original `.js` file
7. Run tests to ensure no regressions
8. **CRITICAL**: Run `yarn prettier-fix` prior to committing.

### ⚡ Efficient Commands (Use These)

```bash
# TypeScript compilation check (fast, use this)
yarn typecheck

# Combined check, remove, and test in one command (most efficient)
yarn typecheck && rm src/utils/filename.js && yarn test

# Batch operations for multiple files
yarn typecheck && rm src/utils/file1.js src/utils/file2.js && yarn test

# Stage and commit changes
git add -A
git commit -m "Convert X files to TypeScript"
```

### ❌ Inefficient Commands (Avoid These)

```bash
# DON'T: Individual file checking (too slow)
yarn typecheck-file src/utils/filename.ts
npx tsc --noEmit --skipLibCheck src/utils/filename.ts

# DON'T: Project + file mixing (causes errors)
npx tsc --noEmit --skipLibCheck --project tsconfig.migration.json src/utils/filename.ts

# DON'T: Direct tsc without yarn (missing from PATH)
tsc --noEmit --skipLibCheck --project tsconfig.migration.json

# DON'T: Separate test runs (wastes time)
yarn typecheck
rm src/utils/filename.js
yarn test  # Run together instead
```

### 💡 Pro Tips

- **Project-wide `yarn typecheck` is faster** than individual file checks
- **Batch multiple file conversions** before testing to save time
- **Use `&&` operators** to chain commands efficiently
- **Remove original files only after** successful TypeScript compilation
- **The migration config is optimized** - project-wide checks are very fast (~0.65s)

### Proven Flow→TypeScript Conversion Patterns

#### React Component Patterns

```typescript
// Flow class component
class ComponentName extends PureComponent<Props, State> {
  state = { value: true };
  render() { ... }
}

// TypeScript class component
class ComponentName extends PureComponent<Props, State> {
  override state = { value: true };
  override render() { ... }
}
```

#### Connected Component Pattern

```typescript
// Flow
import type { ConnectedProps } from '../../utils/connect';
type StateProps = {
  +prop: string,
};

// TypeScript
import { ConnectedProps } from '../../utils/connect';
type StateProps = {
  readonly prop: string;
};
```

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
return new Set([...set1].filter((x) => set2.has(x)));

// TypeScript (correct)
return new Set(Array.from(set1).filter((x) => set2.has(x)));
```

#### 6. Function Types

```typescript
// Flow
type Fn = ('send', GAPayload) => void;

// TypeScript
type Fn = (command: 'send', payload: GAPayload) => void;
```

#### 7. `assertExhaustiveCheck`

Usually used in switch default cases. When switching on a property of an object,
discard that property because the entire object will be the `never` type in TS.

```typescript
// Flow
default:
   throw assertExhaustiveCheck(error.type);

// TypeScript
default:
   throw assertExhaustiveCheck(error);
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
        test: /\.jsx?$/, // Flow files
        presets: [
          [
            '@babel/preset-env',
            { useBuiltIns: 'usage', corejs: '3.9', bugfixes: true },
          ],
          ['@babel/preset-react', { useSpread: true }],
          ['@babel/preset-flow', { all: true }],
        ],
      },
      {
        test: /\.tsx?$/, // TypeScript files
        presets: [
          [
            '@babel/preset-env',
            { useBuiltIns: 'usage', corejs: '3.9', bugfixes: true },
          ],
          ['@babel/preset-react', { useSpread: true }],
          ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
        ],
      },
    ],
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
- `yarn typecheck` - Check TypeScript compilation for converted files only
- `yarn typecheck-file <file>` - Check specific TypeScript file
- `yarn test-all` - Run all checks (TypeScript + lint + test + etc.) - **PASSES during migration**
- `yarn test-all-flow` - Original test-all with Flow (will fail during migration)
- `yarn test-all-migration-done` - Post-migration test-all (will fail until migration complete)

### Critical Configuration Files

- `tsconfig.json` - TypeScript configuration (working correctly)
- `tsconfig.migration.json` - Migration-specific config (only checks .ts/.tsx files)
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

### Phase 2: ✅ COMPLETED - Utility Files

- Target: 40 files in src/utils/
- Current: 40/40 complete (100%)
- All utility files successfully migrated to TypeScript

### Phase 3: 🔄 IN PROGRESS - React Components

- Target: 150+ files in src/components/
- Current: 4/150+ complete (2.7%)
- ✅ Started with simple leaf components (Warning, BlobUrlLink, FooterLinks)
- ✅ Successfully converted connected component (DebugWarning)
- Focus: Continue with more leaf components before complex ones

### Phase 4: ⏳ PLANNED - Connected Components

- Add TypeScript types to existing ExplicitConnect patterns
- Create typed versions of selectors and actions
- No API changes during migration

### Phase 5: ⏳ PLANNED - Final Cleanup

- Remove Flow infrastructure (.flowconfig, dependencies)
- Update documentation
- Enable stricter TypeScript settings
