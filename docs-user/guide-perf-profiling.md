# Profiling with Linux perf

Linux has a native profiler called 'perf' that can profile any application. This profiler has a built-in profile viewer in the form of the `perf report` command, but you may not like its UI.

[perf.html](https://perf-html.io/) provides an alternative UI for these profiles; it knows how to display profiles from perf.

(Importing other profile sources is being investigated, such as in [issue #1138](https://github.com/devtools-html/perf.html/issues/1138), [PR #1065](https://github.com/devtools-html/perf.html/pull/1065) and [PR #1260](https://github.com/devtools-html/perf.html/pull/1260).)

There are three major differences between the Gecko profiler and perf:

 1. The Gecko profiler can only profile Gecko. Perf can profile any process on the system.
 2. The Gecko profiler samples at a fixed rate based on wall-clock time. Perf samples based on elapsed CPU time per thread.
 3. The Gecko profiler only samples a small set of threads by default. Perf samples all threads of the given process or process tree.

As a consequence of point 2, perf has far lower overhead than the Gecko Profiler when profiling many threads: perf only takes a sample whenever a thread is running, whereas the Gecko profiler will keep sampling all profiled threads at a fixed rate even when those threads are idle.

## Usage instructions

(This assumes you've installed perf.)

There are three steps to obtaining a perf profile and loading it in perf.html:

 1. Capture a profile with perf.
 2. Convert it into a text form.
 3. Load the text file in perf.html.

### Step 1: Capture the profile

You can attach perf to an existing (running) process, or you can launch a new process from it and profile it from the start, including the entire process tree launched from it.

To attach to an existing process with PID `<pid>`, use:

```bash
perf record -g -F 999 -p <pid>
# Stop with Ctrl+C once you've collected enough
```

To launch a new process under the profiler, use

```bash
perf record -g -F 999 program options
# Stop with Ctrl+C once you've collected enough
```

For Firefox, this would be:

```bash
perf record -g -F 999 firefox -P profile -no-remote
```

The `perf record` command writes the profile into a file called `perf.data` in the current directory.

### Step 2: Convert the profile

After exiting perf, convert the perf data into something perf.html can read:

```bash
perf script -F +pid > /tmp/test.perf
```

The `perf script` command takes the `perf.data` file that was written by the `perf record` command as its implicit input.

### Step 3: View the profile in perf.html

You can now load the .perf file into perf.html: just tell perf.html to open the file and it should be auto-identified and loaded.
Note that there will be no markers and no categories.  Many stack frames will say `[unknown]`.  There will be no JavaScript stacks, unless you do extra work as described below.  Symbols might be mangled.

## Analyzing perf traces and tips

Remember that 'perf' only records a sample if the thread is executing; samples are omitted if the thread is sleeping.  This means in many cases there will be gaps between samples, often large ones.  You probably want to switch from "Categories" to "Stack height" mode in the top left corner in order to see when samples were taken across the different threads.

Perf sometimes has trouble walking the stack, and you'll get mis-rooted subtrees at the top level.

Perf can include kernel callstacks in the profile. They might show up as `[unknown]` frames from the `[kernel.kallsyms]` library. Setting `/proc/sys/kernel/perf_event_paranoid` to 1 or less can potentially help with this.

If you need JavaScript stacks, you can build Firefox with `--enable-perf` and then run it with the env variable `IONPERF=func`. This will allow some of the `[unknown]` frames to be resolved to JS source files/functions. Doing so does have some impact on the recorded profile, but it's generally small.
