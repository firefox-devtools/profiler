# Profiling with Linux perf

You can use perf.html to view Linux 'perf' profiles in a much more interactive manner than "perf report" and the like.  Perf has far lower overhead when capturing than the native Gecko Profiler does, especially when we want to look at all threads.

(Importing other profile sources is being investigated, such as in Issue #1138, PR #1065 and PR #1260.)

# Capture
(This assumes you've installed perf, and set /proc/sys/kernel/perf_event_paranoid to 1 or less.)

Capture a profile (of any program) with:
```bash
perf record -g -F 999 program options
```
For Firefox, this would be:
```bash
perf record -g -F 999 firefox -P profile -no-remote
```

Alternatively, capture a specific process with
```bash
perf record -g -F 999 -p <PID>
```

After exiting perf, process the perf data into something perf.html can read with:
```bash
perf script -F +pid >/tmp/test.perf
```

You can record perf traces as root, and potentially get more data on the code's execution.  However, firefox will block running as root on Linux; to work around this use:
```bash
sudo perf record -g -F 999 sudo -u yourself firefox -P profile -no-remote
```

# Viewing in perf.html

You can now load a .perf file into perf-html; just tell it to open the file and it should be auto-identified and loaded.
Note that there will be no markers and no categories.  Many parts of stacks will say <Unknown>.  Some of these can be resolved to JS source files/functions by building Firefox with --enable-perf, and then running it with the env variable IONPERF=func.  This does have some impact on the recorded profile, but it's generally small.

# Analyzing perf traces and Tips

Remember that 'perf' only records a sample if the thread is executing; samples are omitted if the thread is sleeping.  This means in many cases there will be gaps between samples, often large ones.

perf also sometimes has trouble walking the stack, and you'll get mis-rooted subtrees at the top level.
