# AGENTS.md

Firefox Profiler (https://profiler.firefox.com/) visualizes performance profiles, primarily from the Gecko Profiler built into Firefox. It has two frontends: a client-side React + Redux + TypeScript web app and `profiler-cli` (aliased as `pq`) for querying profiles from the terminal. Both share the profile logic in `src/profile-logic/`, so put profile computations there instead of duplicating them in either frontend.

## Commands

Use the Node version from `.nvmrc`. Always go through `yarn` scripts. The test scripts set `LC_ALL=C TZ=UTC NODE_ENV=test`, so calling `jest` directly produces different results.

- `yarn start` - production build on port 4242 (service worker disabled). `yarn start-dev` for a development build on 4241. Override with `FX_PROFILER_PORT`.
- `yarn build` / `yarn build-prod` - build into `dist/`. `yarn serve-static` serves `dist/` on port 4243.
- `yarn ts` - type check
- `yarn lint` / `yarn lint-fix` - oxlint, Stylelint and oxfmt. Run `yarn lint-fix` after every change.
- `yarn test [path] [-t "name"]` - Jest, browser project only (all `src/**/*.test.*`). Add `-u` to update snapshots.
- `yarn test-cli` - builds profiler-cli, then runs its unit and integration tests (`profiler-cli/src/test/`)
- `yarn test-all` - everything above plus a few extra checks. Runs on pre-push.

## Layout

- `src/actions`, `src/reducers`, `src/selectors` - Redux with redux-thunk and reselect.
- `src/app-logic` - store creation, URL state (`url-handling.ts`), constants, WebChannel, IndexedDB storage
- `src/components/<feature>` - React components with co-located plain CSS files (not CSS Modules). Shared UI in `components/shared`.
- `src/profile-logic` - profile processing (`process-profile.ts`), transforms (`transforms.ts`), symbolication, source maps, upgraders
- `src/profile-logic/import` - non-Gecko importers: Chrome, Linux perf, simpleperf, ART trace, DHAT, flame graph text
- `src/profile-query` - query library used by profiler-cli
- `src/types` - shared type definitions, `src/utils` - generic helpers
- `src/test/{unit,components,store,integration}` - tests. Fixtures and profile builders in `src/test/fixtures`, custom matchers in `src/test/fixtures/custom-assertions.ts`.
- `docs-developer/` - architecture, profile formats, symbolication, markers. Read the relevant doc before changing those areas.

Import aliases: `firefox-profiler` -> `src/`, `firefox-profiler-res` -> `res/`.

## Profile data

- Performance is very important. Profiles can exceed 100MB, and sample, stack, frame and marker tables can have millions of rows. Prefer typed arrays and column-oriented tables, and avoid per-sample allocations.
- The profile format is documented in `src/types/{profile,profile-derived,gecko-profile}.ts`. Read them before making assumptions about profile structure.
- The stack, frame, func, resource, native symbol and source tables and the string array live in `profile.shared` and are shared across all threads. Samples, markers and allocations are per thread.
- Put derived data in memoized Redux selectors instead of components, so it's computed once and doesn't cause extra rerenders. Per-thread selectors come from `getThreadSelectors()` in `src/selectors/per-thread/index.ts`, which caches a selector set per thread, because a selector that takes a thread index as an argument breaks memoization.
- Changing the Gecko or processed profile format requires bumping `GECKO_PROFILE_VERSION` / `PROCESSED_PROFILE_VERSION` in `src/app-logic/constants.ts`, adding an upgrader in `gecko-profile-versioning.ts` / `processed-profile-versioning.ts`, and documenting it in `docs-developer/CHANGELOG-formats.md`. See `docs-developer/upgrading-profiles.md` for the process.
- Profile upgraders must never change once deployed. Don't import helpers from `profile-logic` or elsewhere into an upgrader, because those helpers can change later. Inline the logic instead.

## Conventions and gotchas

- Import from `firefox-profiler/...` instead of relative `../../` paths. Import shared types from `firefox-profiler/types`.
- When branching on a union type or enum, prefer a `switch` with a `throw assertExhaustiveCheck(..)` default branch. Prefer `ensureExists(x, msg)` over non-null assertions. Both live in `src/utils/types.ts`.
- Avoid `Pick<>` and `Omit<>`. Prefer a named type that says what the subset is for.
- Index types should have semantic names like `IndexIntoCallNodeTable`, not plain `number`.
- Don't create a new file for a single small function unless it's a logically separate module.
- Anything that should survive a reload or be shareable belongs in URL state, and shape changes need a `CURRENT_URL_VERSION` bump plus an upgrader in `src/app-logic/url-handling.ts`.
- Test behavior, not implementation details. Don't add unit tests that just restate the code.
- Build test profiles with `getProfileFromTextSamples()` from `src/test/fixtures/profiles/processed-profile.ts` instead of writing them by hand. Store tests create a store with `storeWithProfile()` from `src/test/fixtures/stores.ts`, dispatch actions and assert on selectors. Component tests use React Testing Library through `src/test/fixtures/testing-library.tsx`.
- Timeline, flame graph and stack chart render to canvas, so component tests assert on draw calls or snapshots rather than DOM text.

## Localization

User-facing strings go through Fluent (`<Localized>` or `localize()`). Only edit `locales/en-US/app.ftl`. Other locales come from Pontoon. IDs follow `ComponentName--string-summary`.

- When the meaning of a string that is already on `main` changes, including what one of its variables means, or when an attribute (like `.title`) is added or removed, rename its key so the change is picked up. Strings that only exist on your branch can be edited in place.
- Localizers see one string at a time in Pontoon, so every comment must make sense on its own. Never write "same as the previous string" or "see above".
- Document every variable under a `# Variables:` line as `#   $name (Type) - meaning`. A variable name must mean the same thing in every string of a group.
- Don't comment strings that are already clear. Add a comment when a short string doesn't tell where it's shown or what it refers to.
- Translations can be much longer than English. Let text wrap, or in single-line controls like tabs, truncate or scroll.

## Code comments

Keep comments to a strict minimum. Comment only non-trivial code, functions whose arguments aren't self-explanatory, and type definitions and their members. Don't remove existing comments unless they relate to what you are changing.

## Verifying against Gecko

Gecko is the ground truth for the profile format, marker schemas, thread structure, symbolication and WebChannel behavior. Never assume how Gecko behaves. Check the Firefox source with `searchfox-cli` instead of guessing, and suggest installing it if it's missing. Most relevant code lives under `tools/profiler/` in mozilla-central, but it might be anywhere (especially for markers).

```bash
searchfox-cli -q ProfileBufferEntry              # Text/symbol search
searchfox-cli -q StackFrame -p ^tools/profiler   # Restrict to a path prefix
searchfox-cli --define 'ProfileBuffer::AddEntry' # Full definition
searchfox-cli --get-file tools/profiler/core/platform.cpp --lines 100-200
```

Useful flags: `-R mozilla-beta|mozilla-release`, `--exclude-tests`, `--exclude-generated`, and `--permalink` for commit-pinned links when citing sources. See `searchfox-cli --help` for more.

## profiler-cli (`pq`)

`profiler-cli/` is a CLI for querying profiles from the terminal. A daemon keeps the profile in memory and short-lived clients talk to it over Unix domain sockets. Query logic belongs in `src/profile-query/`. The daemon only routes requests. `pq` is an alias, so treat any mention of pq as profiler-cli. Start a session with `pq load <PATH|URL>` and run `pq guide` for the full command set.

To run it from source, build with `yarn build-cli` and run `profiler-cli/dist/profiler-cli.js`. Set `PROFILER_CLI_SESSION_DIR=.profiler-cli-dev` to keep dev sessions separate from an installed `pq`.

`profiler-cli/README.md` covers usage and sessions. `profiler-cli/CONTRIBUTING.md` covers the architecture, IPC protocol and how to add commands.

`profiler-cli/guide.txt` (shown by `pq guide`) is read by agents, so every word costs context. Keep it minimal and leave out anything that isn't needed.
