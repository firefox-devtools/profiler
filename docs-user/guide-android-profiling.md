# Perf Profiling on Android

Android has an application [`simpleperf`](https://android.googlesource.com/platform/system/extras/+/master/simpleperf/doc/README.md) which can profile any Android process. Simpleperf is mostly a drop-in replacement for the Linux `perf` tool.

Firefox Profiler can visualise these `simpleperf` profiles, augmenting the viewers that ship with `simpleperf` (e.g. [`report_html.py`](https://android.googlesource.com/platform/system/extras/+/master/simpleperf/doc/scripts_reference.md#report_html_py)).

For specifically profiling Firefox for Android, see [Remote Profiling Firefox for Android](guide-remote-profiling.md).

## Install simpleperf

Install the latest version of `simpleperf`, which can output profiles for Firefox Profiler:

```bash
git clone https://android.googlesource.com/platform/system/extras
cd extras/simpleperf
```

## Usage instructions

### Step 1: Capture the profile

Record a profile following [the simpleperf instructions](https://android.googlesource.com/platform/system/extras/+/master/simpleperf/doc/scripts_reference.md#app_profiler_py), e.g. to profile the startup of `MyActivity` within app `com.example.myapplication`, run:

```bash
./app_profiler.py -p com.example.myapplication -a .MyActivity
```

This records the profile into a `perf.data` file, and pulls it to your host.

### Step 2: Convert the profile

Then convert to a `perf script` format, using [`report_sample.py`](https://android.googlesource.com/platform/system/extras/+/master/simpleperf/doc/scripts_reference.md#report_sample_py):

```bash
./report_sample.py > perf.txt
```

`report_sample.py` takes the `perf.data` file that was written before as its implicit input.

### Step 3: View the profile in profiler.firefox.com

You can now load the `perf.txt` file into [profiler.firefox.com](https://profiler.firefox.com): tell the Firefox Profiler to open the file and it should be auto-identified and loaded.

## See also

The tips in [Perf Profiling for Linux](guide-perf-profiling.md).
