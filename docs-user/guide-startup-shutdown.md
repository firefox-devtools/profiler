# Profiling Firefox Startup & Shutdown

## Startup

1. Start your Firefox with the environment variable `MOZ_PROFILER_STARTUP=1` set. This way, the profiler is started as early as possible during startup.

2. Then capture the profile using the add-on, as usual.

Startup profiling does not use the settings that you configured in the add-on's panel. It uses settings that can be configured with the environment variables `MOZ_PROFILER_STARTUP_ENTRIES` and `MOZ_PROFILER_STARTUP_INTERVAL`:

* If it looks like the buffer is not large enough, you can tweak the buffer size with the env var `MOZ_PROFILER_STARTUP_ENTRIES`. This defaults to 1000000, which is 9MB. If you want 90MB, use 10000000, and for 180MB, use 20000000, which are good values to debug long startups.

* If you'd like a coarser resolution, you can also choose a different interval using `MOZ_PROFILER_STARTUP_INTERVAL`, which defaults to 1 (unit is millisecond). You can't go below 1 ms, but you can use e.g. 10 ms.

## Shutdown

---
**NOTE**

A recorded Firefox shutdown profile won't be symbolicated, so when loading it into [perf-html.io](https://perf-html.io) it will be of limited use. [Issue #1458](https://github.com/devtools-html/perf.html/issues/1458) addresses this.

---

1. Start your Firefox with the environment variable `MOZ_PROFILER_SHUTDOWN=<filename>` set, where `<filename>` is the name of the file where the recorded profile should be saved.

2. Start the profiler using the add-on, then close Firefox.

3. The file you specified will contain the recorded profile. Load it through the [perf-html.io](https://perf-html.io) interface by either drag and drop or the file upload interface.
