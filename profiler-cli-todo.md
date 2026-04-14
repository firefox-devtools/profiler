# profiler-cli To-Do List

Feature wishlist and improvement ideas for the profiler-cli profile query tool.

---

## Active Proposals

**[Filters and Bookmarks System](profiler-cli-filters-and-bookmarks-proposal.md)** - Comprehensive design for ephemeral vs sticky state, filter system, and bookmarks.

---

## Critical Priority (Blocking Effective Use)

### 1. Persistent Context Display ✅

Every command output displays current context in a compact header:

```
[Thread: t-0 (GeckoMain) | View: Full profile | Full: 30.42s]
[Thread: t-0 (GeckoMain) | View: ts-Fo→ts-Fu (851.1ms) | Full: 30.42s]
[Thread: t-0,t-93 (GeckoMain, Renderer) | View: Full profile | Full: 30.42s]
```

### 2. Function Search/Filter ✅

Commands available:

```bash
profiler-cli thread functions                       # List all functions with CPU%
profiler-cli thread functions --search Present      # Substring search
profiler-cli thread functions --min-self 1          # Filter by self time percentage
profiler-cli thread functions --limit 50            # Limit results
```

### 3. Smart Range Navigation ⚠️

**Status:** Partially implemented - marker handles work, CPU spike navigation doesn't yet

**Implemented:**

```bash
profiler-cli zoom push m-158                     # Zoom to marker's time range
```

**Still needed:**

```bash
profiler-cli profile hotspots                    # List all high-CPU periods
profiler-cli zoom push --spike 1                 # Jump to first spike
profiler-cli zoom push --spike next              # Next spike from current position
profiler-cli profile hotspots --min-cpu 150%     # Find sustained >150% periods
```

**Enhancement:** Named bookmarks:

```bash
profiler-cli zoom push ts-Fo,ts-Fu --name "resize-thrash"
profiler-cli zoom list
profiler-cli zoom push resize-thrash
```

### 4. Cross-Thread Marker View ✅

Commands available:

```bash
profiler-cli thread markers --thread t-0,t-93     # Merged view of specific threads
profiler-cli thread functions --thread t-0,t-93   # Functions from multiple threads
profiler-cli thread samples --thread t-0,t-93     # Samples from multiple threads
profiler-cli thread select t-0,t-93               # Select threads (sticky)
```

**Not yet implemented:**

```bash
profiler-cli marker related m-158                 # Show markers on other threads at same time
```

---

## High Priority (Significant Value)

### 5. Relative Handle References ❌

**Problem:** Must scroll back to find handles like "m-168" when investigating

**Proposed:**

```bash
profiler-cli marker info m-@1             # First marker in last listing
profiler-cli marker info m-@last          # Last marker in last listing
profiler-cli marker info m-@longest       # Longest duration in last listing
profiler-cli marker info m-@prev          # Previously inspected marker

profiler-cli function expand f-@1         # First function in last listing
profiler-cli function expand f-@highest   # Highest self-time
```

**Alternative:** Show rank in listings:

```
Markers in thread t-0 — 50 markers
  #1 → m-147 (28.89ms)  Runnable
  #2 → m-148 (15.23ms)  Runnable
```

Then allow: `profiler-cli marker info #1` or `profiler-cli marker info @1`

### 6. Stack Availability Indicators ✅

Visual indicators (✓/✗) next to marker handles with legend:

```
Markers in thread t-0 (Parent Process) — 50 markers (filtered from 258060)
Legend: ✓ = has stack trace, ✗ = no stack trace

By Name (top 15):
  SimpleTaskQueue::AddTask      7 markers  (instant)
    Examples: m-25 ✓, m-26 ✓, m-27 ✓
  Runnable                     15 markers  (interval: min=1µs, avg=285µs)
    Examples: m-20 ✗ (3.95ms), m-21 ✗ (61µs)
```

### 7. Bottom-Up Call Tree ✅

Command available:

```bash
profiler-cli thread samples-bottom-up              # Bottom-up call tree
```

Shows inverted call tree starting from leaf functions, directly answering "what code paths lead to this bottleneck?"

### 8. Sample Output Filtering ⚠️

**Status:** Partially implemented (--limit exists for markers but not samples)

**Flags needed:**

```bash
profiler-cli thread samples --limit 30               # Top 30 functions only
profiler-cli thread samples --min-self 1%            # Hide functions <1% self time
profiler-cli thread samples --max-depth 15           # Limit tree depth
profiler-cli thread samples --top-only               # Skip call trees
profiler-cli thread samples --tree-only              # Skip top functions list
```

**Enhancement:** Show truncation stats when call tree is cut off:

```
Regular Call Tree (showing top 30 functions, 249 lines omitted):
  (root) [total: 100.0%]
  └─ ...

[249 lines omitted: 142 unique functions, max self time 0.3%, cumulative 2.1%]
```

### 9. Dual Percentages When Zoomed ✅

When zoomed, shows both view and full profile percentages:

Note: In the current implementation, function handles are canonical shared
`funcTable` indices. `f-123` means "function at shared funcTable index 123", not
the first function encountered in the current session.

```bash
# When zoomed:
Functions (by self time):
  f-1. win32u.dll!ZwUserMsgWaitForMultipleObjectsEx - self: 2024 (39.8% of view, 12.3% of full)

# When not zoomed:
Functions (by self time):
  f-1. win32u.dll!ZwUserMsgWaitForMultipleObjectsEx - self: 6916 (42.2%), total: 6916 (42.2%)
```

### 10. Inline Thread Selection ⚠️

**Proposed:**

```bash
profiler-cli thread samples --thread t-93          # Query without selecting
profiler-cli thread info --thread t-0              # Peek at thread
profiler-cli thread markers --thread t-93 --search Paint
```

### 11. Function Info Shows Full Name ✅

The `profiler-cli function info` command displays both full and short names:

Note: Function info is resolved from `profile.shared.funcTable`, so the handle is
profile-global rather than thread-local.

```bash
Function f-1:
  Full name: win32u.dll!ZwUserMsgWaitForMultipleObjectsEx
  Short name: ZwUserMsgWaitForMultipleObjectsEx
  Is JS: false
  ...
```

### 12. Module-Level Grouping ❌

**Proposed:**

```
Top Functions (by self time):
  63.5%  ntdll.dll!ZwWaitForAlertByThreadId
   8.6%  ntdll.dll!NtWaitForSingleObject
   ...

Module Summary:
  14.3%  atidxx64.dll (AMD GPU Driver - 23 functions)
  12.8%  xul.dll (Firefox Core - 156 functions)
   9.2%  ntdll.dll (Windows NT - 12 functions)
```

### 13. Profile Summary Command ❌

**Proposed:**

```bash
profiler-cli summary                           # Overall profile summary
profiler-cli thread summary                    # Current thread(s) summary
```

Example output:

```
Profile Summary [ts-Fo → ts-Fu] (851ms, 100% CPU)

Top Threads:
  t-93 (Renderer):    36.5% active, 63.5% waiting
  t-0  (GeckoMain):   42.2% waiting, 34.3% active

Hot Functions:
  16.3%  dxgi.dll!CDXGISwapChain::PresentImpl
   7.7%  WaitForFrameGPUQuery
   4.1%  atidxx64.dll (AMD driver)

Activity:
  91,300  Layout operations (30K style flushes)
      17  Composite frames (avg: 12.7ms)
       3  CSS transitions (200ms each)
```

---

## Medium Priority (Nice to Have)

### 14. CPU Activity Timestamps Inline ✅

Timestamp names show actual times inline:

```bash
profiler-cli profile info

CPU activity over time:
- 100% for 390.6ms: [ts-6 → ts-7] (2.701s - 3.092s)
- 100% for 255.3ms: [ts-8 → ts-9] (3.102s - 3.357s)
- 100% for 851.1ms: [ts-Fo → ts-Fu] (9.453s - 10.305s)
```

### 15. Enhanced Zoom Output ✅

Zoom output shows duration, depth, and marker context:

```bash
profiler-cli zoom push ts-i,ts-M
Pushed view range: ts-i → ts-M (6.991s - 10.558s, duration 3.567s)
  ts-i: Start of CPU spike #3 (100% CPU sustained)
  ts-M: End of marker m-143 (Composite frame)
  Zoom depth: 2/5 (use "profiler-cli zoom pop" to go back)
```

### 16. Range Comparison ❌

**Proposed:**

```bash
profiler-cli compare ts-6,ts-7 vs ts-8,ts-9              # Compare two ranges

# Example output:
Comparison: [ts-6,ts-7] (391ms) vs [ts-8,ts-9] (255ms)

CPU Activity:
  Range 1: 100% CPU (390.6ms)     Range 2: 100% CPU (255.3ms)

Top Functions:
  Range 1                           Range 2
  42.2%  ZwWaitForAlertByThreadId   45.1%  ZwWaitForAlertByThreadId  (+2.9%)
  16.3%  CDXGISwapChain::Present    18.7%  CDXGISwapChain::Present   (+2.4%)
```

### 17. Wait/Idle Analysis ❌

**Proposed:**

```bash
profiler-cli thread waits                        # Show all wait operations
profiler-cli thread waits --min-duration 10ms    # Significant waits only
profiler-cli thread waits --summary              # Aggregate stats
```

### 18. Frame-Level Analysis ❌

**Proposed:**

```bash
profiler-cli thread frames                       # List paint/composite frames
profiler-cli thread frames --slow                # Frames >16ms (jank)
profiler-cli frame info 72                       # Details about frame #72
```

### 19. Stack-Level Inspection ❌

**Proposed:**

```bash
profiler-cli thread stacks                       # Show heaviest individual stacks
profiler-cli thread stacks --limit 5             # Top 5 heaviest
```

### 20. Split Sample Command ⚠️

**Proposed:**

```bash
profiler-cli thread samples-top [--limit N]      # Just top functions
profiler-cli thread samples-tree [--max-depth N] # Just call tree
profiler-cli thread samples                      # All views (backward compat)
```

Note: `samples-bottom-up` is already a separate command (item #7).

### 21. Cross-Thread Context ❌

**Proposed:**

```bash
profiler-cli profile info --in-zoom              # Show top threads/CPU in current zoom range
profiler-cli marker related m-158                # Show markers on other threads at same time
```

Example:

```
$ profiler-cli marker related m-168
Marker m-168: Reflow (interruptible) at 3717465.724ms

Related markers (±10ms window):
  t-93 (Renderer):
    m-5432  [3717465.2ms]  Composite #72 (started 0.5ms before)
    m-5433  [3717467.1ms]  Texture uploads (during reflow)
```

### 22. Filter Provenance ❌

**Problem:** Output shows "50 markers (filtered from 258060)" but doesn't explain how filtering reduced the count

Was it zoom? Search filter? Duration filter? Limit? Users can't tell what contributed to the reduction.

**Proposed:** Show filter provenance chain:

```
50 markers shown (zoom: 258060 → 91300, filters: 91300 → 1200, limit: 1200 → 50)
```

Or more compact:

```
50 markers (from 258060: zoom→91300, filters→1200, limit→50)
```

This helps users understand whether they're missing important data due to filters or just seeing everything that matches their criteria.

---

## Low Priority (Polish)

### 23. Frequency Analysis Terminology ✅

Marker output uses clear terminology:

```
Frequency Analysis:
  Image Paint: 29081.3 markers/sec (interval: min=4µs, avg=36µs, max=468µs)
```

The first number is frequency (markers/sec), and the min/avg/max values are intervals (time gaps between markers).

### 24. Export/Save ❌

**Proposed:**

```bash
profiler-cli thread samples --output report.txt        # Save to file
profiler-cli thread markers --json > markers.json      # JSON already works
profiler-cli session export investigation.pqsession    # Save entire session state
```

### 25. Color Output ❌

**Proposed:** Color-code percentages, durations, and handles for easier scanning

### 26. Progress Indicators ❌

**Proposed:** Show progress for operations >1s:

```
$ profiler-cli load large-profile.json.gz
Loading profile... 45% (123MB/273MB)
```

### 27. Sparklines/Histograms ❌

**Proposed:** ASCII sparklines for temporal distribution:

```
Markers in thread t-0:
  Reflow: 534 markers  ▁▂▃▅▇█▇▅▃▂▁  (peak: ts-Fo → ts-Fu)
  Paint:  127 markers  ▃▃▂▂▅▅▇█▃▂▁  (peak: ts-r → ts-s)
```

### 28. Smart Function Name Display ❌

**Enhancements:**

- Allow `--name-width N` to control truncation
- Show ellipsis `...` when truncated
- For very long names, show start + end

### 29. Auto-Suggest Next Steps ❌

**Proposed:** After commands, suggest related actions:

```
$ profiler-cli marker info m-168
Marker m-168: Reflow (interruptible) - 907µs
...

💡 Next steps:
   profiler-cli marker stack m-168            # View call stack
   profiler-cli zoom push m-168               # Zoom to this marker's time range
   profiler-cli thread markers --search Reflow --min-duration 500  # Find similar markers
```

---

## Summary by Priority

**Critical:** 1 item remaining (3 completed)

- Smart range navigation - partially implemented (markers work, CPU spikes don't)

**High:** 4 items remaining (5 completed)

- Relative handle references
- Sample output filtering - partially implemented
- Inline thread selection
- Module-level grouping
- Profile summary command

**Medium:** 7 items remaining (2 completed)

- Range comparison
- Wait/idle analysis
- Frame-level analysis
- Stack-level inspection
- Split sample command - partially implemented
- Cross-thread context
- Filter provenance

**Low:** 6 items remaining (1 completed)

- Export/save
- Color output
- Progress indicators
- Sparklines/histograms
- Smart function name display
- Auto-suggest next steps

---

## Core Features Already Implemented

- **Marker support** with rich filtering (`--search`, `--category`, `--min-duration`, `--max-duration`, `--has-stack`, `--limit`, `--group-by`, `--auto-group`)
- **Function handles** (`function expand`, `function info`)
- **Smart function name truncation** (120 char limit, tree-based parsing)
- **Zoom range management** (`zoom push`, `zoom pop`, `zoom clear`, `status`)
- **Library/module names** in function display
- **Timestamp names + readable times**
- **Deep call trees** (Regular and Bottom-up/Inverted)
- **Persistent context display** in all command outputs
