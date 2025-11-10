# Profile Query CLI (pq) - Case Study Report

## Profile Investigation Summary

**Profile:** https://share.firefox.dev/4oLEjCw (Firefox 146 on Windows 11)

### Findings

The profile shows **bursty rendering activity** rather than sustained performance issues. Key observations:

1. **Thread CPU Distribution:**
   - GPU process (p-14): 16.1s total CPU time
     - Renderer thread (t-93): 7.9s (26% active, 63.5% idle overall)
     - WRWorker threads: ~1.5s each (88-95% idle)
   - Parent Process GeckoMain (t-0): 7.9s (42% waiting, 26% sleeping)

2. **Activity Pattern:**
   - Baseline: 81% CPU utilization across ~30 seconds
   - Spikes: 160% CPU (2 cores saturated) in bursts of 200-1000ms
   - Most threads spend majority of time idle waiting for work

3. **Active Work Breakdown:**
   - GPU Renderer: 7.5% checking device state (`WaitForFrameGPUQuery`), ~9% waiting on GPU operations
   - Main thread: Blocked on IPC (`SendFlushRendering`), waiting for compositor responses
   - WRWorker threads: Skia rendering (`SkRasterPipelineBlitter`, path operations)
   - **Limited visibility:** ~15% of time in unsymbolicated GPU driver functions (`fun_a56960`, etc.) - can't determine which library without module names

**Diagnosis:** This is not a "slow" profile - it's a profile of normal responsive rendering with expected idle time. The system waits appropriately between frames and for GPU operations to complete. No obvious bottleneck identified, though GPU driver work (which accounts for a significant portion of time) cannot be fully characterized without library/module context.

---

## pq Usability Evaluation

### What Worked Well

**1. Fast Profile Loading**
Loading a remote profile from share.firefox.dev was smooth and quick. The daemon model works well.

**2. Progressive Exploration**
The workflow of `profile info` → `thread select` → `thread samples` felt natural for drilling down into threads.

**3. View Range Zooming**
`view push-range ts-6,ts-7` successfully filtered to spike periods. The concept of pushing/popping ranges is solid.

**4. Command Consistency**
Commands follow predictable patterns: `thread select`, `thread info`, `thread samples`. Easy to remember.

**5. Output Quality - Thread Info**
The CPU activity timeline with indented percentages is excellent:

```
- 26% for 30404.1ms (14464 samples): [ts-2,ts-Yz]
  - 40% for 4829.3ms (2238 samples): [ts-5,ts-Fa]
    - 60% for 161.3ms (73 samples): [ts-FX,ts-FY]
```

This nested view clearly shows when and where CPU spikes occur.

---

### Critical Issues

**1. Missing Library/Module Names**
The single biggest problem. Output shows bare function names without context:

- `fun_a56960`, `fun_a48860`, `fun_1159e6` - which library are these from?
- `0x7ffdbb3c8055`, `0x13c9bd2dcf1` - what module contains these addresses?

**Context:** Graphics drivers often don't provide symbol information, so function names like `fun_a56960` are expected. However, the web UI shows **which library** the function is in (e.g., `nvoglv64.dll`, `amdvlk64.dll`, `d3d11.dll`), which is crucial for diagnosis.

**Impact:** Cannot tell if time is spent in:

- GPU driver code (expected for rendering)
- System libraries (might indicate OS contention)
- Unknown/JIT code (might indicate JavaScript or corrupted stacks)
- Third-party DLLs (might indicate extension issues)

Even without function symbols, knowing "14% of time in GPU driver" vs "14% in unknown code" is the difference between actionable insight and confusion.

**Needed:**

- Show library/module names for all functions: `nvoglv64.dll!fun_a56960`
- Group by module in top functions: "15% in nvoglv64.dll (GPU driver)"
- Annotate unknown addresses with their module when available
- Special handling for JIT code addresses (mark as "JS JIT" if from SpiderMonkey heap)

**2. Truncated Call Trees**
Regular call trees are cut off early, showing only 10 levels before "..." when there are clearly more levels. Example:

```
└─  └─  └─  └─  └─  └─  └─  └─  └─  └─ MessageLoop::Run() [total: 100.0%, self: 0.0%]
```

Then it just stops, even though there's clearly more interesting work below.

**Impact:** Cannot see the actual work being done, only the dispatch machinery.

**Needed:**

- Show more levels by default (at least 20-30)
- Add a parameter to control depth: `--max-depth=50` or `--full-tree`
- Smart truncation: continue showing branches with >5% self time

**3. Timestamp Display Issues**
After `view pop-range`, timestamps were shown as:

```
ts<78 (-3,703,142,204,026ns) to ts<79 (-3,702,751,569,159ns)
```

**Problems:**

- Negative nanosecond values are meaningless to users
- Should show relative times like "2.701s to 3.092s" as push-range did
- Inconsistent between push and pop

**4. Limited Function List**
"Top Functions" shows only 20 functions, then:

```
... (6603 more functions omitted, max total: 16392, max self: 6916, sum of self: 2818)
```

**Impact:** Cannot see secondary bottlenecks. If top function is 42% waiting (expected), I need to see what the other 58% is doing.

**Needed:**

- Show at least top 50 functions
- Add `--limit=N` parameter
- Better filtering: `--min-self-time=1%` to hide trivial functions

**5. Heaviest Stack Truncation**
The heaviest stack shows "... (42 frames skipped)" in the middle:

```
  20. NS_ProcessNextEvent(nsIThread*, bool)
  ... (42 frames skipped)
  63. nsWindow::WindowProcInternal(...)
```

**Impact:** Cannot see the full execution path. The skipped frames are often the most important.

**Needed:** Never skip frames in "heaviest stack" - it's only one stack, show all frames.

---

### Missing Features

**1. Marker Support**
Commands exist in help text (`thread markers`) but aren't implemented. Markers are crucial for understanding:

- Layout/style/reflow costs
- JavaScript function names
- IPC message types
- GPU command boundaries

**Impact:** Major gap. Half of profiling insight comes from markers.

**2. Time Range Selection by Content**
No way to find "ranges where thread X is >80% active" or "show me the longest frame". Currently must:

- Read profile info manually
- Copy timestamp names
- Push range manually

**Needed:**

- `view find-spikes --thread t-93 --min-cpu=80%`
- `view find-longest-frame`
- `view show-frame 42` (jump to Nth frame)

**3. Cross-Thread Analysis**
No way to see what multiple threads were doing during the same time range. Had to manually:

- Push range for spike period
- Select thread, view samples
- Select another thread, view samples
- Mentally correlate

**Needed:**

- `thread compare t-0 t-93` showing both threads side-by-side
- `profile samples --all-threads` during current view range

**4. Function Listing/Search**
No way to search for specific functions. Wanted to find all places where `nsTreeImageListener::AddCell` appears (saw it used 0.3% CPU), but had to scroll through output.

**Needed:**

- `thread functions` to list all functions with CPU time
- `thread functions -E "nsTree"` to filter with regex (see Design Recommendations §6)

**5. JavaScript-Specific Commands**
No way to view just JavaScript execution:

- Filter to JIT frames vs C++ frames
- See hot JavaScript functions
- Understand script URLs

**6. Export/Save**
No way to save investigation results. Had to pipe to `head` manually. Would want:

- `thread samples --output=report.txt`
- `profile export --format=json` for scripting

---

### Cognitive Load Assessment

**Learning Curve: Low ✓**

- Commands are intuitive if you understand profiling concepts
- Help text is clear
- Predictable command structure

**Mental Model: Good ✓**

- Daemon/client separation is invisible (good)
- Thread selection persists across commands (good)
- View range stack metaphor is clear

**Context Switching: Moderate**

- Remembering timestamp names (ts-6, ts-7) is awkward
- Have to remember which thread is selected
- No way to see "current state" - need `pq status` showing:
  - Current session
  - Selected thread
  - Current view range stack

**Memory Burden: High**

- Timestamp names are opaque (ts-6 vs ts-FX)
- Must remember findings from previous commands
- No way to annotate or save intermediate results

---

### Output Quality

**Profile Info: Excellent ✓✓✓**

- Clear hierarchy (processes → threads)
- CPU percentages make relative costs obvious
- Timeline sections show burst patterns
- Top threads immediately visible

**Thread Info: Excellent ✓✓✓**

- Nested CPU activity is perfect for finding spikes
- Sample counts + durations both shown
- Thread lifecycle (created/ended) useful

**Thread Samples: Good but Limited**

- Top functions by total/self time is standard profiler output
- Inverted call tree is useful
- Heaviest stack helps identify primary path

**Problems:**

- Too much truncation (as detailed above)
- No percentage filter (hide <1% functions)
- Call tree depth insufficient
- Missing symbols are jarring

---

### Ergonomics

**Command Length: Mixed**

- Short commands are nice: `thread info`, `profile info`
- Thread handles work well: `t-93` is concise
- Timestamp ranges are verbose: `view push-range ts-6,ts-7`
  - **Addressed in Design Recommendations §2**: support `view push 2.7,3.1` (seconds)

**Discoverability: Good ✓**

- `--help` shows all commands
- Error messages are clear
- Command structure is guessable

**Error Recovery: Needs Work**

- No undo for thread selection (minor)
- Can't peek at view range without pushing
- No validation of timestamp names before pushing

**Workflow Efficiency:**

- Too many steps to compare threads during a spike
- No way to iterate quickly through interesting ranges
- Must manually correlate information across commands

---

### Design Recommendations

This section addresses key design questions that arose during the case study.

#### 1. Timestamp Display: Always Show Both

**Current issue:** Compact names (ts-6) are opaque; long timestamps are hard to remember.

**Recommendation:** Show both everywhere:

```
Pushed view range: ts-6 (2.701s) to ts-7 (3.092s)
Popped view range: ts-6 (2.701s) to ts-7 (3.092s)
```

**Benefits:**

- Compact names for scripting/reference: `view push ts-6,ts-7`
- Human-readable context for understanding
- Consistency between push and pop

#### 2. Timestamp Range Input: Support Multiple Formats

**Current issue:** "ts-6,ts-7" is verbose - requires copying from profile info output.

**Recommendation:** Accept multiple formats, parse intelligently:

```bash
view push ts-6,ts-7          # Timestamp names (current)
view push 2.7,3.1            # Relative seconds (new, most ergonomic)
view push 2.7s,3.1s          # Explicit unit (new)
view push 2700ms,3100ms      # Milliseconds (new)
view push 10%,20%            # Percentage through profile (new)
```

**Default unit:** Seconds (most natural)

**Benefits:**

- Fast iteration: `view push 2.7,3.1` is much shorter than `view push ts-6,ts-7`
- Intuitive: "zoom into 2.7 to 3.1 seconds" is clear
- Backward compatible: timestamp names still work
- Scriptable: can compute times programmatically

**Implementation note:** Detect format by pattern - if contains `ts-`, use name lookup; if numeric, parse as time; if contains `%`, parse as percentage.

#### 3. Separate Commands for Sample Views

**Current issue:** `thread samples` dumps everything. Flags like `--limit` or `--min-self-time` would apply to all sections, which is awkward.

**Recommendation:** Split into focused commands:

```bash
thread samples-top [--limit=N] [--min-self=1%] [--by={total|self}]
  # Just top functions by total/self time

thread samples-tree [--max-depth=N] [--min-percentage=1%]
  # Just regular call tree

thread samples-inverted [--max-depth=N] [--min-percentage=1%]
  # Just inverted call tree

thread samples-heaviest [--no-skip | --max-frames=N]
  # Just heaviest stack

thread samples  # Keep for backward compatibility
  # All views (current behavior)
```

**Benefits:**

- Each view has appropriate parameters
- Faster output when you only need one view
- More composable with shell tools (`| grep`, `| less`)
- Can set sensible per-view defaults

**Alternative considered:** `thread samples --view=top --limit=50`

- Rejected: less ergonomic, harder to discover views

#### 4. Heaviest Stack Truncation: Increase Cap with Safety Limit

**Current issue:** 27 frames shown, 42 skipped - way too aggressive.

**Recommendation:**

- Default: Show up to **200 frames** (covers 99% of real stacks)
- Safety: Cap at **500 frames** to prevent terminal flooding from infinite recursion
- Flag: `--max-frames=N` to override
- Never skip in the middle - if truncated, show first N frames with clear message:
  ```
  ... (300 more frames omitted - use --max-frames to see all)
  ```

**Rationale:**

- 200 frames handles even deep template/async stacks
- 500 frame safety net catches bugs
- Skipping frames in the middle destroys diagnostic value

#### 5. Function Names: Smart Truncation, No Handles

**Issue:** Long C++ names with templates are verbose and hard to scan.

**Recommendation: Smart truncation without handles**

Function handles (`f-234`) add cognitive overhead and indirection. Instead:

**Length cap: 100 characters** with smart truncation:

```
# Original (150 chars):
std::_Hash<std::_Umap_traits<SGuid,CPrivateData,std::_Uhash_compare<SGuid,std::hash<SGuid>,std::equal_to<SGuid>>,std::allocator<std::pair<SGuid const,CPrivateData>>,0>>::~_Hash()

# Truncated (100 chars):
std::_Hash<std::_Umap_traits<SGuid,CPrivateData,...,0>>::~_Hash()
```

**Rules:**

1. Keep module/library name: `nvoglv64.dll!` always shown
2. Keep actual function name: `~_Hash()` always shown
3. Truncate middle of namespaces/templates: `...`
4. Preserve enough to be unique in context

**For call trees:** Even more aggressive (60 char limit) since indentation eats space:

```
mozilla::wr::RenderThread::UpdateAndRender(...)
```

**Benefits:**

- No cognitive overhead of handle indirection
- Still readable at a glance
- No need for separate lookup command
- Can copy/paste into search

**Alternative considered:** Function handles like `f-234`

- Rejected: requires mental mapping, breaks copy/paste, adds complexity

#### 6. Function Search: Use `thread functions` with Grep Patterns

**Current issue:** No way to search for functions.

**Recommendation:**

```bash
thread functions                    # List all functions with CPU time
thread functions -E "nsTree"        # Regex filter (like grep -E)
thread functions -i "layout"        # Case-insensitive (like grep -i)
thread functions --min-self=1%      # Only functions with >1% self time
```

**Output format:**

```
Functions in thread t-0 (GeckoMain):
  42.2%  ZwUserMsgWaitForMultipleObjectsEx
  26.4%  ZwWaitForAlertByThreadId
   8.1%  NtUserMessageCall
   1.3%  memset
   ... (showing 45 of 6623 functions)
```

**Benefits:**

- Familiar grep-style interface
- Composable: can still pipe to grep for more filtering
- Consistent with ripgrep conventions

**Name:** `thread functions` (not `thread search`) because it's listing/filtering functions, not searching arbitrary text.

#### 7. Command Structure: Clarify State vs Time Range

**Current issue:** Inconsistency between `thread select` and `view push-range` - both change "view state" but use different command prefixes.

**Recommendation: Separate concerns clearly**

Two types of state:

1. **Thread selection** - which thread to analyze
2. **Time range** - which time window to analyze

**Proposed structure:**

```bash
# Thread selection
thread select t-93              # Select thread
thread info                     # Info for selected thread
thread samples-top              # Samples for selected thread

# Time range (keep "view" for time, since it's the "view" into the timeline)
view push ts-6,ts-7             # Push time range
view pop                        # Pop time range
view clear                      # Clear all ranges (back to full profile)
view list                       # Show range stack

# Status (what's my current context?)
status                          # Show session, selected thread, range stack
  # Output:
  # Session: ttzltpqjsi (profile: https://share.firefox.dev/4oLEjCw)
  # Thread: t-93 (Renderer)
  # View ranges: [ts-6 (2.701s) → ts-7 (3.092s)]
```

**Alternative considered:** `time-range push` instead of `view push`

- Rejected: "view" is shorter, intuitive (you're changing your view of the timeline)
- "time-range" is verbose and awkward

**Alternative considered:** `view` command shows status

- Rejected: `view push/pop/clear` makes `view` ambiguous (verb vs noun)
- Better to have explicit `status` command

**Benefits:**

- Clear separation: `thread` = which thread, `view` = which time
- Consistent: all state changes are explicit commands
- `status` shows everything at once

#### 8. Function Name Repetition: Acceptable with Module Context

**Issue:** Function names appear many times in call tree output.

**Analysis:** This is actually fine and expected:

- Call trees inherently repeat names (parent nodes)
- Module prefixes (`nvoglv64.dll!`) add context, not noise
- Truncation (rule #5) keeps length manageable
- Terminal scrollback handles repetition well

**No action needed.** The proposed module display and truncation rules are sufficient.

#### 9. View Range Ergonomics: Range Names for Common Patterns

**Additional idea:** For common access patterns, support named ranges:

```bash
view push spike:1               # First detected CPU spike >80%
view push spike:next            # Next spike after current range
view push frame:5               # 5th vsync frame (if markers present)
view push longest-frame         # Longest frame in profile
```

**Implementation:** These would be computed on-demand, not persisted.

**Benefits:**

- Very fast exploration: "show me the spikes"
- No need to manually parse profile info output
- Great for CI/CD: "report on longest frame"

**Priority:** Medium (do after basic time format support)

---

### Specific Improvements Needed

See **Design Recommendations** section above for detailed proposals on command structure, timestamp formats, and function display.

**High Priority:**

1. **Show library/module names** - essential context even without symbols (Design Rec. §1)
2. **Fix timestamp display** - show both compact name and readable time (Design Rec. §1)
3. **Support time formats** - accept seconds, ms, % in addition to timestamp names (Design Rec. §2)
4. **Separate sample commands** - `thread samples-top`, `samples-tree`, etc. (Design Rec. §3)
5. **Deeper call trees** - show 30+ levels by default, cap at 200 for call trees
6. **Fix heaviest stack truncation** - show up to 200 frames, never skip middle (Design Rec. §4)
7. **Implement markers** - huge gap in functionality

**Medium Priority:**

8. **Status command** - show session/thread/range state (Design Rec. §7)
9. **Function listing** - `thread functions -E "pattern"` (Design Rec. §6)
10. **Smart function truncation** - 100 char cap, preserve module + function name (Design Rec. §5)
11. **Cross-thread views** - compare threads during same range
12. **Named ranges** - `view push spike:1`, `longest-frame` (Design Rec. §9)

**Low Priority:**

13. **Export results** - save to file
14. **Progress indicators** - loading large profiles
15. **Color output** - highlight high percentages in output

---

### Comparison to Web UI

**pq Advantages:**

- Much faster for quick triage
- Easy to script/automate
- Lower memory usage
- Works over SSH
- Can process many profiles in batch

**Web UI Advantages:**

- Visual timeline shows everything at once
- Mouse hover reveals details instantly
- Can see multiple threads simultaneously
- Marker tooltips show rich information
- Source view integration
- Network panel, memory tracks, etc.

**Ideal Use Cases for pq:**

- Quick "what's slow?" triage
- CI/CD performance monitoring
- Batch analysis of many profiles
- Server-side investigation (no GUI)
- Extracting specific data for reports

**Where pq Falls Short:**

- Complex multi-thread timing issues
- Understanding frame scheduling
- Correlating markers with samples
- Visual pattern recognition
- Exploratory analysis without hypothesis

---

### Overall Assessment

**Current State: Promising Foundation (60% there)**

pq successfully demonstrates that CLI profiling is viable and valuable. The core architecture (daemon model, thread selection, view ranges) is sound. For profiles where you can identify which libraries are consuming time and single-threaded bottlenecks, it works reasonably well.

**Critical Gaps:**

- Library/module context is essential - without it, functions are unidentifiable blobs
- Output truncation hides too much information
- Missing marker support eliminates half of profiling value

**Recommendation:**
Fix the three critical gaps above before adding new features. A tool that shows incomplete information (truncated trees, missing module context, no markers) frustrates users more than missing features.

**Potential:**
If library names, depth, and markers are addressed, pq could become the standard first-response tool for performance issues. "Run pq first, open web UI if needed" would be a great workflow.

**Estimated to "Production Ready":**

- With critical fixes: 2-3 weeks
- With medium priority features: 4-6 weeks
- With low priority polish: 8-10 weeks

The foundation is solid. The gaps are addressable. The value proposition is clear.

---

### Summary of Key Design Decisions

Based on the case study investigation, here are the recommended design directions:

**1. Command Structure** (Design Rec. §7)

```bash
thread select t-93              # Select which thread
thread samples-top              # View top functions (separate commands per view)
view push 2.7,3.1              # Push time range (view = time window)
status                          # Show current state
```

- `thread` for thread operations, `view` for time ranges, `status` for context
- No function handles (f-234) - use smart truncation instead

**2. Time Range Input** (Design Rec. §2)

```bash
view push ts-6,ts-7     # Timestamp names (keep for compatibility)
view push 2.7,3.1       # Seconds (NEW, default - most ergonomic)
view push 2700ms,3100ms # Milliseconds (NEW)
view push 10%,20%       # Percentage (NEW)
```

- Always display both: "ts-6 (2.701s)" in output

**3. Sample View Commands** (Design Rec. §3)

- Separate commands: `samples-top`, `samples-tree`, `samples-inverted`, `samples-heaviest`
- Each has appropriate flags: `--limit`, `--max-depth`, `--min-self`, etc.
- Keep `thread samples` for backward compatibility (shows all)

**4. Function Display** (Design Rec. §5)

- Show module names: `nvoglv64.dll!fun_a56960`
- Smart truncation: 100 chars max, preserve module + function name
- Call trees: 60 chars (indentation eats space)
- No function handles

**5. Output Limits**

- Top functions: Show 50 by default (was 20)
- Call tree depth: Show 30+ levels by default (was ~10)
- Heaviest stack: Show 200 frames (was 27), never skip middle
- Safety cap: 500 frames max to catch infinite recursion

**6. Function Search** (Design Rec. §6)

```bash
thread functions            # List all with CPU%
thread functions -E "nsTree" # Regex filter (grep-style)
```

**7. Status/Context**

```bash
status  # Show session, selected thread, view range stack
```

These decisions prioritize:

- **Ergonomics**: `view push 2.7,3.1` is much faster than `view push ts-6,ts-7`
- **Consistency**: Clear separation between `thread` (which) and `view` (when)
- **Readability**: Module names and smart truncation over handles
- **Composability**: Separate commands work better with pipes/scripts
- **Discoverability**: Grep-style flags, clear command names
