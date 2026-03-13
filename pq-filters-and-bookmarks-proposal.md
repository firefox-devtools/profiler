# pq Filters and Bookmarks Proposal

**Status:** Proposal (revised based on feedback)
**Created:** 2025-01-04
**Last Updated:** 2025-01-04
**Related:** pq-todo.md

---

## Key Design Decisions

Based on feedback, this proposal includes:

1. ✅ **Consistent terminology** - `push/pop/clear` for zoom and filters, `load/unload` for bookmarks
2. ✅ **Multi-thread selection** - `thread select t-0,t-93` works for sticky state
3. ✅ **Clear OR vs AND** - `-any` suffix for OR, repeated flags for AND
4. ✅ **Per-profile bookmarks** - scoped to current profile, not global
5. ✅ **Zoom validation** - nested ranges must be contained within parent
6. ✅ **Unified naming** - `--includes-prefix` instead of `--starts-with-function`/`--starts-with-sequence`
7. ✅ **Balanced zoom syntax** - `zoom push ts-6,ts-7` and `zoom push --marker m-158`
8. ✅ **Single filter stack** - one ordered stack for sample/stack filters (order matters for dependencies)
9. ✅ **Prefix means exact sequence** - `--includes-prefix A,B,C` means starts with A→B→C exactly
10. ✅ **Per-thread filter stacks** - each thread has its own filter context (handles are thread-specific!)
11. ✅ **Separate marker filters** - marker display filtering independent from sample/stack filtering

---

## Overview

This proposal defines a comprehensive system for managing analysis state in pq with **four independent dimensions**:

1. **Thread selection** (global) - which thread(s) you're analyzing
2. **Zoom** (global) - time range you're focused on
3. **Sample/Stack filters** (per-thread) - how to filter and transform samples
4. **Marker filters** (per-thread) - how to filter marker display

Each dimension supports:

- **Ephemeral use** - apply once via flags
- **Sticky state** - persists across commands via push/pop/clear
- **Bookmarks** - save and restore complex views

---

## Design Principles

1. **Ephemeral by default** - All commands accept filter flags that apply only to that invocation
2. **Explicit stickiness** - Making state sticky requires explicit commands (`select`, `zoom push`, `filter add`)
3. **Clear state** - `pq status` always shows current thread, zoom, and active filters
4. **Composable** - Filters, zoom, and thread selection are independent dimensions
5. **Saveable** - Complex views can be bookmarked and recalled

---

## Core Syntax

### 1. Ephemeral Filters (Flags)

All commands accept filter flags that apply only to that command:

```bash
# Ephemeral thread selection
pq thread samples --thread t-93
pq thread markers --threads t-0,t-93

# Ephemeral zoom
pq thread samples --zoom ts-6,ts-7
pq thread markers --zoom m-158

# Ephemeral sample filters
pq thread samples --includes-any-function PresentImpl,FlushD3D11
pq thread samples --during-marker --search Paint
pq thread samples --includes-prefix f-1,f-2,f-3

# Ephemeral stack transforms
pq thread samples --merge malloc,free,arena_dalloc
pq thread samples --root-at f-142
pq thread samples --strip-prefix f-1,f-2,f-3

# Combinations work
pq thread samples --thread t-93 --zoom ts-6,ts-7 --merge malloc --limit 20
```

### 2. Sticky Thread Selection

```bash
pq thread select t-93              # Select single thread (sticky)
pq thread samples                  # Uses t-93

pq thread select t-0,t-93          # Select multiple threads (sticky)
pq thread samples                  # Uses both threads

pq thread select t-0               # Switch to different thread
```

### 3. Sticky Zoom (Stack-based)

```bash
pq zoom push ts-6,ts-7             # Push zoom level
pq thread samples                  # Uses zoomed range

pq zoom push ts-6a,ts-6c           # Zoom further (within previous range)
pq thread samples                  # Uses nested zoom

pq zoom pop                        # Pop one zoom level (back to ts-6,ts-7)
pq zoom pop                        # Pop again (back to full profile)

pq zoom clear                      # Clear entire zoom stack

# Convenience forms
pq zoom push m-158                 # Zoom to marker's time range (✅ implemented)
pq zoom push --spike 1             # Zoom to first CPU spike (future feature)
```

### 4. Sticky Sample/Stack Filters (Per-Thread)

Each thread has its own filter stack. Filters are **scoped to the current thread** because function handles (f-142) are thread-specific.

```bash
# Select thread first
pq thread select t-93

# Push filters onto THIS THREAD's stack
# Each filter is applied in push order

# Sample filters (which samples to include)
pq filter push --includes-any-function f-142,f-143  # Filter 1: includes f-142 OR f-143
pq filter push --includes-function f-142            # Filter 2: AND (must also have f-142)
pq filter push --includes-function f-200            # Filter 3: AND (must also have f-200)

pq filter push --during-marker --search Paint       # Filter 4: during Paint markers
pq filter push --includes-prefix f-100,f-200        # Filter 5: stack starts f-100→f-200
pq filter push --includes-suffix f-142              # Filter 6: stack ends with f-142

# Inverse sample filters (exclude)
pq filter push --excludes-any-function malloc,free  # Exclude samples
pq filter push --outside-marker --search GC

# Stack transform filters (modify stacks before sample filtering)
pq filter push --strip-prefix f-1,f-2,f-3           # Strip then sample-filter
pq filter push --merge malloc,free,arena_dalloc     # Merge away allocators
pq filter push --merge-regex "^(malloc|free|moz_x)"
pq filter push --root-at f-142                      # Re-root stacks
pq filter push --strip-suffix f-999

# Order matters! Example:
pq filter push --strip-prefix A,B,C                 # 1. Strip A→B→C from stacks
pq filter push --includes-prefix D                  # 2. Then filter by prefix D
# Filter 2 sees stacks AFTER filter 1 has transformed them

# Management
pq filter list                     # Show filters for current thread
pq filter pop                      # Pop most recent filter
pq filter pop 3                    # Pop 3 most recent filters
pq filter clear                    # Clear all filters for current thread

# Switch threads - different filter stack!
pq thread select t-0
pq filter list                     # t-0's filters (independent from t-93)

# Filters apply to sample analysis commands
pq thread samples                  # Uses current thread's filters
```

### 5. Sticky Marker Filters (Per-Thread)

Each thread also has its own marker filter stack, independent from sample/stack filters.

```bash
# Select thread
pq thread select t-0

# Push marker display filters onto THIS THREAD's marker filter stack
pq marker filter push --search Paint
pq marker filter push --category Graphics
pq marker filter push --min-duration 5
pq marker filter push --max-duration 100
pq marker filter push --has-stack

# Marker filters affect marker display
pq thread markers                  # Shows only filtered markers

# Management
pq marker filter list              # Show marker filters for current thread
pq marker filter pop               # Pop most recent marker filter
pq marker filter clear             # Clear all marker filters for current thread

# Switch threads - different marker filter stack!
pq thread select t-93
pq marker filter list              # t-93's marker filters (independent from t-0)

# Marker filters only affect marker display, not sample analysis
pq thread samples                  # NOT affected by marker filters
pq thread markers                  # Affected by marker filters
```

**Note:** Sample/stack filters that reference markers (e.g., `--during-marker --search Paint`) operate on the **unfiltered** marker set. Marker filters only affect display, not sample filtering logic.

### 6. Bookmarks

Bookmarks save complex views for later recall. They are **per-profile** (scoped to the current session's profile).

```bash
# Create bookmarks
pq bookmark view spike1 --zoom ts-6,ts-7 --threads t-0,t-93
pq bookmark filter no-allocators --merge malloc,free,arena_dalloc

# Use bookmarks ephemerally
pq thread samples --view spike1
pq thread samples --filter no-allocators
pq thread samples --view spike1 --filter no-allocators

# Load bookmarks (make sticky)
pq bookmark load view spike1           # Sets zoom + threads sticky
pq bookmark load filter no-allocators  # Applies filters sticky

# Management
pq bookmark list                   # Show all bookmarks for current profile
pq bookmark info spike1            # Show bookmark details
pq bookmark delete spike1          # Remove bookmark
pq bookmark export spike1 > spike1.json  # Export for sharing (future)
pq bookmark import spike1.json     # Import bookmark (future)
```

### 7. Status Command

Always shows current state across all dimensions:

```bash
pq status

# Output:
Session: 3ugy6phmzqc
Profile: https://share.firefox.dev/4oLEjCw
Thread: t-93 (Renderer)
Zoom: ts-6,ts-7 (2.701s - 3.091s)
  └─ parent: full profile (0s - 30.5s)

Sample/Stack Filters for t-93 (applied in order):
  1. [stack transform] merge: malloc, free, arena_dalloc, je_malloc
  2. [sample filter] includes function: f-142 (dxgi.dll!CDXGISwapChain::PresentImpl)
  3. [sample filter] during markers matching: --search Paint

Marker Filters for t-93:
  1. search: Paint
  2. min-duration: 5ms

Filters for other threads:
  t-0: 2 sample/stack filters, 1 marker filter
  t-99: 1 sample/stack filter, 0 marker filters

Bookmarks loaded:
  - view: spike1
  - filter: no-allocators
```

---

## Filter Types

### Sample Filters (Inclusion/Exclusion)

Control which samples are included in analysis:

```bash
# Include samples where...
# OR semantics: use -any suffix with comma-separated list
--includes-any-function f-142,f-143    # Stack contains f-142 OR f-143
--includes-function f-142              # Stack contains this function (can repeat for AND)

--includes-prefix f-1,f-2,f-3          # Stack starts with this sequence
--includes-suffix f-999                # Stack ends with this function

--during-marker --search Paint         # Timestamp falls within matching marker
--during-marker --category Graphics    # Timestamp falls within marker in category

# Exclude samples where...
--excludes-any-function malloc,free    # Stack does not contain malloc OR free
--excludes-function malloc             # Stack does not contain this function
--outside-marker --search GC           # Timestamp outside matching markers

# Sample filters affect:
# - thread samples (which samples aggregate)
# - thread markers (which samples contribute to marker statistics)
# - thread functions (which samples count toward function time)

# Combining filters:
# - Same flag repeated = AND (--includes-function f-1 --includes-function f-2 = has both)
# - -any suffix = OR (--includes-any-function f-1,f-2 = has either)
```

### Stack Transform Filters

Modify stack traces in all samples:

```bash
# Merge (remove functions from stacks, collapse callers to callees)
--merge malloc,free                    # Remove these functions
--merge-regex "^(malloc|free)"         # Remove matching functions
# A -> malloc -> B becomes A -> B

# Root-at (show only subtree rooted at function)
--root-at f-142                        # Show only time within this function
# Only shows stacks that include f-142, with f-142 as root

# Strip prefix (remove leading frames)
--strip-prefix f-1,f-2,f-3             # Remove these from stack tops
# f-1 -> f-2 -> f-3 -> f-4 becomes f-4

# Strip suffix (remove trailing frames)
--strip-suffix f-999                   # Remove these from stack bottoms
# f-1 -> f-2 -> f-999 becomes f-1 -> f-2

# Stack transforms affect:
# - thread samples (how stacks are displayed)
# - thread functions (which functions appear in list)
# - Call tree structure
```

### Thread and Zoom (Spatial/Temporal)

Not technically "filters" but part of the view context:

```bash
# Thread selection
--thread t-93                       # Single thread (ephemeral)
--threads t-0,t-93                  # Multiple threads (ephemeral)
pq thread select t-93               # Single thread (sticky)

# Zoom (time range)
--zoom ts-6,ts-7                    # Specific range (ephemeral)
--zoom m-158                        # Marker's time range (ephemeral)
pq zoom push ts-6,ts-7              # Push range (sticky)
pq zoom push m-158                  # Push marker's range (sticky, ✅ implemented)
```

---

## Bookmark Types

### View Bookmarks

Capture spatial/temporal context (where/when you're looking):

```bash
pq bookmark view spike1 --zoom ts-6,ts-7 --threads t-0,t-93
pq bookmark view gpu-idle --thread t-93 --zoom ts-p,ts-q

# View bookmarks include:
# - Time range (zoom level)
# - Thread selection (single or multiple)
```

### Filter Bookmarks

Capture analytical transforms (how you're analyzing):

```bash
pq bookmark filter no-allocators \
  --merge malloc,free,arena_dalloc,je_malloc \
  --merge-regex "^moz_x"

pq bookmark filter paint-only \
  --during-marker --search Paint \
  --root-at f-50

# Filter bookmarks include:
# - Sample filters (includes/excludes)
# - Stack transforms (merge/root/strip)
```

### Using Bookmarks

```bash
# Ephemeral use (doesn't change state)
pq thread samples --view spike1
pq thread samples --filter no-allocators
pq thread samples --view spike1 --filter no-allocators

# Sticky load (changes state)
pq bookmark load view spike1           # Sets thread + zoom
pq bookmark load filter no-allocators  # Applies filters
pq status                             # Shows loaded bookmarks
pq thread samples                     # Uses loaded context

# Unload
pq bookmark unload view                # Clear view bookmark
pq bookmark unload filter              # Clear filter bookmark
pq bookmark unload all                 # Clear all bookmarks
```

---

## Example Scenarios

### Scenario 1: Quick CPU Spike Investigation

```bash
# See profile overview
$ pq profile info
# Output shows: "160% CPU for 390ms [ts-6,ts-7]"

# Quick peek at that spike
$ pq thread samples --zoom ts-6,ts-7 --limit 20
# Looks interesting, main thread doing Paint

# Check GPU thread during same time
$ pq thread samples --thread t-93 --zoom ts-6,ts-7 --limit 20
# GPU doing Present

# Make spike sticky to investigate further
$ pq zoom push ts-6,ts-7
$ pq thread select t-0
$ pq thread samples

# Check markers from both threads
$ pq thread markers --threads t-0,t-93
# See WM_PAINT on t-0, Composite on t-93 at same time

# Done with spike
$ pq zoom pop
```

### Scenario 2: Eliminating Allocator Noise

```bash
# Call tree is noisy
$ pq thread samples
# Lots of malloc/free/arena_dalloc

# Try merging ephemerally
$ pq thread samples --merge malloc,free,arena_dalloc --limit 30
# Better! See actual work

# Make it sticky
$ pq filter push --merge malloc,free,arena_dalloc,je_malloc
$ pq filter push --merge-regex "^moz_x"
$ pq thread samples
# Clean call tree across all commands

# Save for future use
$ pq bookmark filter no-allocators --merge malloc,free,arena_dalloc,je_malloc --merge-regex "^moz_x"

# Later session (on same profile)
$ pq bookmark load filter no-allocators
```

### Scenario 3: Analyzing Time in Specific Function

```bash
# Find expensive function
$ pq thread functions --search PresentImpl
# f-142. dxgi.dll!CDXGISwapChain::PresentImpl - 16.4% total

# See what it's calling (ephemeral root)
$ pq thread samples --root-at f-142 --limit 30
# Shows subtree rooted at PresentImpl

# Also filter to only samples that include it
$ pq filter push --includes-function f-142
$ pq filter push --root-at f-142
$ pq thread samples
# Now analyzing only time within PresentImpl

# Check markers during this work
$ pq thread markers
# Sample filters affect marker aggregation too

# Clear when done
$ pq filter clear
```

### Scenario 4: Cross-Thread Causality Chain

```bash
# Main thread fires Paint
$ pq thread select t-0
$ pq marker info m-158
# WindowProc WM_PAINT at 1h2m (33.52ms)

# Zoom to that marker
$ pq zoom push m-158

# See what GPU did during same time
$ pq thread samples --thread t-93 --limit 20
# GPU doing Present work

# Make GPU thread sticky
$ pq thread select t-93

# Only look at samples during Paint markers
$ pq filter push --during-marker --search Paint
$ pq thread samples
# Now only see GPU work that happened during Paint

# Save this analysis (bookmarks are per-profile)
$ pq bookmark view paint-causality --zoom m-158 --thread t-93
$ pq bookmark filter paint-only --during-marker --search Paint

# Later: reload entire analysis (same profile)
$ pq bookmark load view paint-causality
$ pq bookmark load filter paint-only
$ pq thread samples
```

---

## Implementation Notes

### Per-Thread Filter Scoping

**Why per-thread?** Function handles (e.g., `f-142`) are thread-specific. A function handle on thread t-0 has no meaning on thread t-93.

```bash
pq thread select t-0
pq thread functions --search Present
# f-142. dxgi.dll!CDXGISwapChain::PresentImpl on t-0

pq filter push --includes-function f-142  # Filter for t-0

pq thread select t-93
# f-142 on t-93 is a DIFFERENT function!
# t-93 has its own independent filter stack (empty initially)
```

**Behavior when switching threads:**

- Each thread maintains its own sample/stack filter stack
- Each thread maintains its own marker filter stack
- Zoom is global (applies across all threads)
- Thread selection is global (which thread is currently active)

**Status summary:**

- `pq status` shows filters for current thread in detail
- Lists other threads with filter count summaries

### Filter Application Order

Sample/stack filters are applied in **push order** (the order you pushed them onto the stack).

This is critical because filters can depend on each other:

```bash
# Example: Strip prefix, then filter by new prefix
pq filter push --strip-prefix A,B,C    # 1. Transform: remove A→B→C
pq filter push --includes-prefix D     # 2. Filter: include only stacks starting with D
# Filter 2 sees stacks AFTER filter 1's transformation

# Example: Filter samples, then merge stacks
pq filter push --includes-function PresentImpl  # 1. Only samples with PresentImpl
pq filter push --merge malloc,free              # 2. Merge allocators in those samples
```

**General guidance for typical use:**

1. Stack transforms first (--strip-prefix, --merge, --root-at)
2. Sample filters second (--includes, --excludes, --during-marker)

But the single ordered stack gives you flexibility when needed.

### Marker Filters vs Sample Filters Using Markers

**Two different concepts:**

1. **Marker filters** - affect marker display only

   ```bash
   pq marker filter push --search Paint
   pq thread markers  # Shows only Paint markers
   ```

2. **Sample filters using markers** - filter samples based on marker timing
   ```bash
   pq filter push --during-marker --search Paint
   pq thread samples  # Shows only samples during Paint markers
   ```

**Important:** Sample filters that reference markers (e.g., `--during-marker`) use the **unfiltered** marker set, not the display-filtered set. Marker filters only affect `pq thread markers` output.

### Zoom Stack Behavior

Zoom works like a stack, and nested zooms must be contained within parent ranges:

```bash
pq zoom push ts-6,ts-7    # Stack: [full profile, ts-6 to ts-7]
pq zoom push ts-6a,ts-6c  # Stack: [full profile, ts-6 to ts-7, ts-6a to ts-6c]
                          # Validates ts-6a,ts-6c is within ts-6,ts-7
pq zoom pop               # Stack: [full profile, ts-6 to ts-7]
pq zoom pop               # Stack: [full profile]
pq zoom pop               # No-op, already at root

# Invalid: non-nested range
pq zoom push ts-6,ts-7
pq zoom push ts-A,ts-B    # Error: ts-A,ts-B not within ts-6,ts-7
```

### Filter Stack Behavior

Filters form a **single ordered stack** regardless of filter type:

```bash
pq filter push --includes-function f-142               # Stack: [f-142]
pq filter push --during-marker --search Paint          # Stack: [f-142, Paint]
pq filter push --merge malloc                          # Stack: [f-142, Paint, malloc]

pq filter list
# Shows: 3 filters in order
# 1. [sample filter] includes function: f-142
# 2. [sample filter] during markers: --search Paint
# 3. [stack transform] merge: malloc

pq filter pop             # Remove most recent filter (malloc)
                          # Stack: [f-142, Paint]

pq filter pop 2           # Remove 2 most recent filters
                          # Stack: []

pq filter clear           # Remove ALL filters
                          # Stack: []

# Save complex filter stacks via bookmarks
pq bookmark filter my-analysis --includes f-142 --during-marker --search Paint --merge malloc
```

### Bookmark Storage

Bookmarks are **per-profile** and session-local (stored in daemon memory):

- Scoped to the current profile URL/path
- Lost when session ends (`pq stop`)
- Not shared across different profiles or sessions
- Loading a different profile = different set of bookmarks
- Future: could persist to ~/.pq/bookmarks/<profile-hash>/ for cross-session use
- Future: export/import for sharing with colleagues

### Status Command

`pq status` output structure:

```
Session: <session-id>
Thread: <thread-handle> (<thread-name>)
Zoom: <current-range>
  [└─ parent: <parent-range>]  # If zoomed
  [└─ parent: <parent-range>]  # Can be nested
[Filters (applied in order):]
  [N. [type] <filter-description>]
  [...]
[Bookmarks loaded:]
  [- view: <bookmark-name>]
  [- filter: <bookmark-name>]
```

Filter types displayed:

- `[sample filter]` - includes/excludes samples
- `[stack transform]` - modifies stacks
- `[marker filter]` - temporal filtering

---

## Future Enhancements

### Auto-generated Bookmarks

System could create bookmarks automatically:

```bash
pq profile hotspots
# Output:
# 1. [ts-6,ts-7]   160% CPU for 390ms
#    bookmark: spike:1
# 2. [ts-A,ts-b]   160% CPU for 450ms
#    bookmark: spike:2

pq bookmark load view spike:1
# Automatically created bookmarks
```

### Bookmark Export/Import

```bash
pq bookmark export spike1 > spike1.json
pq bookmark import spike1.json

# Share bookmarks with colleagues
```

### Bookmark Aliases

```bash
pq bookmark alias s1 spike1
pq thread samples --view s1
```

### Smart Merge Sets

```bash
pq bookmark filter no-alloc --merge @allocators
# @allocators = predefined set: malloc, free, arena_dalloc, etc.

pq bookmark filter no-overhead --merge @profiler-overhead
# @profiler-overhead = profiler stack frames
```

---

## Open Questions

1. ✅ **Multiple threads in sticky state?** - RESOLVED
   - `thread select t-0,t-93` supports multi-thread selection

2. ✅ **Filter combination logic?** - RESOLVED
   - Use `-any` suffix for OR: `--includes-any-function f-1,f-2`
   - Repeated flags for AND: `--includes-function f-1 --includes-function f-2`

3. ✅ **Zoom validation?** - RESOLVED
   - Nested zooms must be contained within parent ranges
   - Error if attempting to zoom to non-nested range

4. ✅ **Bookmark namespaces?** - RESOLVED
   - Bookmarks are per-profile (scoped to current profile)

5. ✅ **Prefix semantics?** - RESOLVED
   - `--includes-prefix f-1,f-2,f-3` means exactly f-1→f-2→f-3 sequence

6. ✅ **Filter application order?** - RESOLVED
   - Single ordered stack, applied in push order
   - Order matters (can strip prefix then filter by new prefix)

---

## Summary

This proposal creates a consistent, composable system for managing analysis state in pq:

- **Ephemeral filters** via flags work everywhere
- **Sticky state** via explicit push/pop/clear commands
- **Consistent terminology**: push/pop/clear for zoom and filters, load/unload for bookmarks
- **Stack-based**: zoom and filters can be layered and unwound
- **Single filter stack**: one ordered stack for all filters (order matters!)
- **Filter dependencies**: can transform stacks then filter samples
- **OR vs AND semantics**: `-any` suffix for OR, repeated flags for AND
- **Per-profile bookmarks**: scoped to current profile
- **Nested zoom validation**: ranges must be properly contained
- **Status** always shows current context including filter order
- **Composable** - filters, zoom, threads are independent dimensions

The system is designed to be discoverable (flags are ephemeral by default) while supporting power-user workflows (sticky state and bookmarks).
