# pq Filters and Bookmarks Proposal

**Status:** Phase 1 + Phase 2 implemented; Phase 3 (strip-prefix, strip-suffix, merge-regex) and marker display filters and bookmarks are future work
**Created:** 2025-01-04
**Last Updated:** 2026-04-11
**Related:** pq-todo.md

---

## Key Design Decisions

Based on feedback, this proposal includes:

1. ✅ **Consistent terminology** - `push/pop/clear` for zoom and filters, `load/unload` for bookmarks
2. ✅ **Multi-thread selection** - `thread select t-0,t-93` works for sticky state
3. ✅ **Clear OR vs AND** - `-any` suffix for OR, repeated flags for AND
4. ✅ **Per-profile bookmarks** - scoped to current profile, not global (future)
5. ✅ **Zoom validation** - nested ranges must be contained within parent
6. ✅ **Unified naming** - `--includes-prefix` instead of `--starts-with-function`/`--starts-with-sequence`
7. ✅ **Balanced zoom syntax** - `zoom push ts-6,ts-7` and `zoom push m-158`
8. ✅ **Single filter stack** - one ordered stack for sample/stack filters (order matters for dependencies)
9. ✅ **Prefix means exact sequence** - `--includes-prefix f-1,f-2,f-3` means starts with f-1→f-2→f-3 exactly
10. ✅ **Per-thread filter stacks** - each thread has its own filter context
11. ✅ **Function handles are global** - `f-N` is index N into the shared funcTable, stable across sessions and threads
12. ⏳ **Separate marker filters** - marker display filtering independent from sample/stack filtering (future)

---

## Overview

This proposal defines a comprehensive system for managing analysis state in pq with **four independent dimensions**:

1. **Thread selection** (global) - which thread(s) you're analyzing
2. **Zoom** (global) - time range you're focused on
3. **Sample/Stack filters** (per-thread) - how to filter and transform samples ✅ implemented
4. **Marker filters** (per-thread) - how to filter marker display ⏳ future

Each dimension supports:

- **Ephemeral use** - apply once via flags (applies to that command only)
- **Sticky state** - persists across commands via push/pop/clear
- **Bookmarks** - save and restore complex views ⏳ future

---

## Design Principles

1. **Ephemeral by default** - All commands accept filter flags that apply only to that invocation
2. **Explicit stickiness** - Making state sticky requires explicit commands (`select`, `zoom push`, `filter push`)
3. **Clear state** - `pq status` always shows current thread, zoom, and active filters
4. **Composable** - Filters, zoom, and thread selection are independent dimensions
5. **Saveable** - Complex views can be bookmarked and recalled ⏳ future

---

## Core Syntax

### 1. Ephemeral Filters (Flags) ✅ implemented

The following filter flags work on `thread samples`, `thread samples-top-down`,
`thread samples-bottom-up`, and `thread functions`. They apply only to that one
invocation and do not affect the sticky filter stack.

```bash
# Ephemeral sample inclusion/exclusion
pq thread samples --includes-function f-142
pq thread samples --includes-any-function f-142,f-143
pq thread samples --includes-prefix f-100,f-101,f-142
pq thread samples --includes-suffix f-142
pq thread samples --excludes-function f-142
pq thread samples --excludes-any-function f-142,f-143

# Ephemeral marker-based filters
pq thread samples --during-marker --search Paint
pq thread samples --outside-marker --search GC

# Ephemeral stack transforms
pq thread samples --merge f-142,f-143
pq thread samples --root-at f-142

# Multiple ephemeral filters on one command — applied in left-to-right order
pq thread samples --excludes-function f-142 --merge f-143 --during-marker --search Paint

# Ephemeral and sticky filters compose:
# sticky filters are applied first (already in the Redux transform stack),
# then ephemeral filters are layered on top for that one invocation.
pq thread functions --limit 20 --excludes-function f-142
```

**Not yet implemented for ephemeral use:**

- `--zoom <range>` on thread commands (use `pq zoom push` instead)
- `--threads t-0,t-93` on thread commands (use `pq thread select` instead)
- `--strip-prefix`, `--strip-suffix`, `--merge-regex` (Phase 3, see below)
- `--during-marker --category` (only `--search` is supported)

### 2. Sticky Thread Selection ✅ implemented

```bash
pq thread select t-93              # Select single thread (sticky)
pq thread samples                  # Uses t-93

pq thread select t-0,t-93          # Select multiple threads (sticky)
pq thread samples                  # Uses both threads

pq thread select t-0               # Switch to different thread
```

### 3. Sticky Zoom (Stack-based) ✅ implemented

```bash
pq zoom push ts-6,ts-7             # Push zoom level
pq thread samples                  # Uses zoomed range

pq zoom push ts-6a,ts-6c           # Zoom further (within previous range)
pq thread samples                  # Uses nested zoom

pq zoom pop                        # Pop one zoom level (back to ts-6,ts-7)
pq zoom pop                        # Pop again (back to full profile)

pq zoom clear                      # Clear entire zoom stack

pq zoom push m-158                 # Zoom to marker's time range
```

### 4. Sticky Sample/Stack Filters (Per-Thread) ✅ implemented

Each thread has its own filter stack. `pq filter push` appends a filter that
persists across all subsequent analysis commands until popped.

Function handles (`f-N`) identify index N in the shared funcTable — they are
stable across sessions for the same profile.

```bash
# Select thread first
pq thread select t-93

# Push filters onto THIS THREAD's stack (applied in push order)

# Include/exclude samples
pq filter push --includes-function f-142       # keep samples whose stack contains f-142
pq filter push --includes-any-function f-142,f-143  # keep samples with f-142 OR f-143
pq filter push --includes-prefix f-100,f-200   # keep samples whose stack starts f-100→f-200
pq filter push --includes-suffix f-142         # keep samples whose leaf frame is f-142
pq filter push --excludes-function f-142       # drop samples containing f-142
pq filter push --excludes-any-function f-142,f-143  # drop samples containing f-142 or f-143
pq filter push --during-marker --search Paint  # keep samples during Paint markers
pq filter push --outside-marker --search GC    # keep samples outside GC markers

# Stack transforms
pq filter push --merge f-142,f-143,f-144       # collapse these functions out of stacks
pq filter push --root-at f-142                 # re-root all stacks at f-142

# Order matters — each filter sees stacks as left by the previous filter:
pq filter push --root-at f-100                 # 1. re-root at f-100
pq filter push --includes-prefix f-100         # 2. keep only stacks starting with f-100
# Filter 2 operates on stacks already transformed by filter 1

# Management
pq filter list                     # Show filters for current thread
pq filter pop                      # Pop most recent filter
pq filter pop 3                    # Pop 3 most recent filters
pq filter clear                    # Clear all filters for current thread

# Switch threads — different filter stack!
pq thread select t-0
pq filter list                     # t-0's filters (independent from t-93)

# All analysis commands use current thread's filters automatically
pq thread samples
pq thread functions
pq thread samples-top-down
```

**Not yet implemented (Phase 3 / deferred):**

- `--strip-prefix f-1,f-2,f-3` — structural stack mutation
- `--strip-suffix f-x` — structural stack mutation
- `--merge-regex "^pattern"` — regex-based merge across funcTable

### 5. Sticky Marker Filters (Per-Thread) ⏳ not yet implemented

Planned: each thread will also have its own marker filter stack controlling
which markers appear in `pq thread markers` output.

```bash
# Future syntax (not yet implemented)
pq marker filter push --search Paint
pq marker filter push --category Graphics
pq marker filter push --min-duration 5
pq marker filter pop
pq marker filter clear
```

Note: sample filters that reference markers (`--during-marker`, `--outside-marker`)
are already implemented and operate on the **unfiltered** marker set, independent
of any future marker display filters.

### 6. Bookmarks ⏳ not yet implemented

Planned: save and restore complex views (zoom + thread selection, or filter stacks).

```bash
# Future syntax (not yet implemented)
pq bookmark view spike1 --zoom ts-6,ts-7 --threads t-0,t-93
pq bookmark filter no-allocators --merge f-142,f-143
pq thread samples --view spike1          # ephemeral bookmark use
pq bookmark load view spike1             # sticky bookmark use
pq bookmark list
pq bookmark delete spike1
```

### 7. Status Command ✅ implemented

Shows current thread, zoom stack, and all active filter stacks:

```bash
pq status

# Example output:
Session Status:
  Selected thread: t-0 (GeckoMain)
  View range: ts-6 to ts-7
  Filters for t-0:
    1. [merge] merge: f-142, f-143
    2. [during-marker] during marker matching: "Paint"
    3. [includes-function] includes function: f-200
```

---

## Filter Types

### Sample Filters (Inclusion/Exclusion) ✅ implemented

Control which samples are included in analysis. All take `f-N` function handles.

```bash
# Include samples where stack contains the function(s)
--includes-function f-142              # contains f-142 (repeat push for AND)
--includes-any-function f-142,f-143    # contains f-142 OR f-143 (single push)

--includes-prefix f-1,f-2,f-3          # stack starts with f-1→f-2→f-3 (root-first)
--includes-suffix f-999                # leaf frame is f-999

--during-marker --search Paint         # timestamp falls within a matching marker

# Exclude samples where stack contains the function(s)
--excludes-function f-142
--excludes-any-function f-142,f-143    # contains f-142 OR f-143

--outside-marker --search GC           # timestamp outside matching markers

# AND semantics via repeated push:
pq filter push --includes-function f-1   # keep samples with f-1
pq filter push --includes-function f-2   # AND also with f-2
```

**Not yet implemented:**

- `--during-marker --category <name>` (only `--search` supported)

### Stack Transform Filters ✅ partially implemented

Modify the structure of stacks before or after sample filtering.

```bash
# Merge: remove functions from stacks, collapsing their callers to callees
--merge f-142,f-143                    # f-A → f-142 → f-B becomes f-A → f-B
--root-at f-142                        # re-root all stacks at f-142 (focus-function)
```

**Phase 3 (not yet implemented):**

```bash
--strip-prefix f-1,f-2,f-3             # remove leading root frames from stacks
--strip-suffix f-999                   # remove trailing leaf frames from stacks
--merge-regex "^(malloc|free)"         # merge functions matching a regex
```

---

## Example Scenarios

### Scenario 1: Quick CPU Spike Investigation

```bash
# See profile overview
$ pq profile info
# Output shows a spike around ts-6,ts-7

# Quick peek at that spike
$ pq zoom push ts-6,ts-7
$ pq thread samples --limit 20

# Check what's happening in the Renderer thread during that time
$ pq thread samples --thread t-26 --limit 20

# Make thread selection sticky and investigate further
$ pq thread select t-26
$ pq thread samples

# Done with spike
$ pq zoom pop
```

### Scenario 2: Eliminating Allocator Noise

```bash
# Call tree shows allocator noise
$ pq thread functions --search malloc
# → f-142. libmalloc!malloc_zone_malloc - self: 8.2%

# Try merging ephemerally first
$ pq thread samples --merge f-142,f-143 --limit 30
# Better! See actual work

# Make it sticky
$ pq filter push --merge f-142,f-143
$ pq thread samples
# Clean call tree across all subsequent commands

# Remove when done
$ pq filter clear
```

### Scenario 3: Analyzing Time in a Specific Function

```bash
# Find an expensive function
$ pq thread functions --search PresentImpl
# → f-500. XUL!CDXGISwapChain::PresentImpl - self: 16.4%

# Ephemeral: see the subtree rooted at it
$ pq thread samples --root-at f-500 --limit 30

# Sticky: focus all analysis on samples containing it
$ pq filter push --includes-function f-500
$ pq filter push --root-at f-500
$ pq thread samples
$ pq thread functions

# Clear when done
$ pq filter clear
```

### Scenario 4: Cross-Thread Causality

```bash
# Look at main thread markers
$ pq thread select t-0
$ pq marker info m-158
# WindowProc WM_PAINT at ... (33.52ms)

# Zoom to that marker
$ pq zoom push m-158

# See what the Renderer thread was doing during the same window
$ pq thread samples --thread t-26 --limit 20

# Make it sticky and drill further
$ pq thread select t-26
$ pq filter push --during-marker --search Paint
$ pq thread samples
# Now only see Renderer work that happened during Paint markers
$ pq filter clear

$ pq zoom pop
```

---

## Implementation Status

### Phase 1 — Implemented ✅ (Redux transform-backed)

| Flag                                                          | Redux transform                    |
| ------------------------------------------------------------- | ---------------------------------- |
| `--excludes-function f-x` / `--excludes-any-function f-x,f-y` | `drop-function` (one per func)     |
| `--merge f-x,f-y,f-z`                                         | `merge-function` (one per func)    |
| `--root-at f-x`                                               | `focus-function`                   |
| `--during-marker --search Text`                               | `filter-samples` (`marker-search`) |

### Phase 2 — Implemented ✅ (extended `filter-samples` transforms)

New `FilterSamplesType` values in `src/types/transforms.ts` / `src/profile-logic/transforms.ts`:

| Flag                                                          | filterType         | Logic                                                               |
| ------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| `--includes-function f-x` / `--includes-any-function f-x,f-y` | `function-include` | Walk stackTable; keep samples whose stack contains any of the funcs |
| `--includes-prefix f-1,f-2,f-3`                               | `stack-prefix`     | Keep samples whose root-first frame sequence matches                |
| `--includes-suffix f-x`                                       | `stack-suffix`     | Keep samples whose leaf frame is the given func                     |
| `--outside-marker --search Text`                              | `outside-marker`   | Inverse of `marker-search`                                          |

### Phase 3 — Deferred

- `--strip-prefix f-1,f-2,f-3` — requires new structural stack transform (removes leading frames)
- `--strip-suffix f-x` — requires new structural stack transform (removes trailing frames)
- `--merge-regex "^pattern"` — requires regex scan of the funcTable before dispatching transforms

### Architecture

- **`src/profile-query/filter-stack.ts`** — `FilterStack` class: per-thread `Map<ThreadsKey, FilterEntry[]>`; `push()` dispatches Redux transforms immediately; `pop()` uses `POP_TRANSFORMS_FROM_STACK` to unwind them; `pushSpecTransforms()` exported for ephemeral use
- **`ProfileQuerier`** — `filterPush/Pop/List/Clear` for sticky filters; `_withEphemeralFilters()` for one-shot use; filter state in `getStatus()`
- Sticky filters live in the Redux transform stack and are automatically applied by all analysis commands via `getFilteredThread()`
- Ephemeral filters are pushed on top of sticky ones for the duration of one call, then popped
- `outside-marker`, `function-include`, `stack-prefix`, `stack-suffix` are pq-only and not URL-serializable

---

## Implementation Notes

### Per-Thread Filter Scoping

**Why per-thread?** The Redux transform stack is per-thread (`ThreadsKey` → `TransformStack`). Pushing a filter dispatches to a specific thread's transform stack.

Function handles themselves are global (index into `profile.shared.funcTable`), so `f-142` means the same function regardless of which thread's filter stack it is pushed onto.

```bash
pq thread select t-0
pq filter push --includes-function f-142  # on t-0's transform stack

pq thread select t-26
pq filter list                            # t-26's stack (empty — independent from t-0)
```

### Filter Application Order

Filters are applied in **push order**. Because each filter sees the thread data
as transformed by all previous filters, the order determines the semantics:

```bash
# Root-at first, then include-prefix: the prefix check runs on re-rooted stacks
pq filter push --root-at f-100
pq filter push --includes-prefix f-100

# Merge first, then include: only samples where f-142 appears AFTER merging allocators
pq filter push --merge f-300,f-301
pq filter push --includes-function f-142
```

### Actual `pq status` Output Format

```
Session Status:
  Selected thread: t-0 (GeckoMain)
  View range: Full profile
  Filters for t-0:
    1. [excludes-function] excludes function: f-184
    2. [during-marker] during marker matching: "Paint"
    3. [includes-function] includes function: f-200
```

Filter type labels in output match the `SampleFilterSpec.type` field:
`excludes-function`, `merge`, `root-at`, `during-marker`, `includes-function`,
`includes-prefix`, `includes-suffix`, `outside-marker`.

---

## Open Questions

1. ✅ **Multiple threads in sticky state?** - RESOLVED: `thread select t-0,t-93`
2. ✅ **Filter combination logic?** - RESOLVED: `-any` suffix for OR, repeated pushes for AND
3. ✅ **Zoom validation?** - RESOLVED: nested zooms validated against parent range
4. ✅ **Bookmark namespaces?** - RESOLVED design (per-profile); implementation deferred
5. ✅ **Prefix semantics?** - RESOLVED: `--includes-prefix f-1,f-2,f-3` means exactly f-1→f-2→f-3 root-first
6. ✅ **Filter application order?** - RESOLVED: single ordered stack applied in push order
7. ✅ **Function handle scope?** - RESOLVED: `f-N` is global (shared funcTable index), not per-thread

---

## Summary

This proposal creates a consistent, composable system for managing analysis state in pq:

- **Ephemeral filters** via flags on any thread analysis command — not persisted ✅
- **Sticky filters** via `filter push/pop/clear` — persists across commands ✅
- **Consistent terminology**: push/pop/clear for zoom and filters, load/unload for bookmarks
- **Stack-based**: zoom and filters can be layered and unwound ✅
- **Single filter stack**: one ordered stack for all filters per thread (order matters!) ✅
- **OR vs AND semantics**: `-any` suffix for OR within a single push, repeated pushes for AND ✅
- **Global function handles**: `f-N` stable across sessions and threads ✅
- **Status** always shows current context including active filters ✅
- **Composable**: ephemeral filters layer on top of sticky ones ✅
- **Nested zoom validation**: ranges must be properly contained ✅
- **Bookmarks**: design resolved, implementation deferred ⏳
- **Marker display filters**: design resolved, implementation deferred ⏳
- **Phase 3 stack transforms** (`--strip-prefix/suffix`, `--merge-regex`): deferred ⏳
