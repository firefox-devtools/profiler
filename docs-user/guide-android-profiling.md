# Perf Profiling on Android

Firefox profiler can visualize the CPU profiles exported from [Android Studio CPU Profiler](https://developer.android.com/studio/profile/cpu-profiler) as `*.trace` files. Load the exported file into [profiler.firefox.com](https://profiler.firefox.com), using drag-and-drop or "Load a profile from file".

Alternatively, Android ndk provides [`simpleperf`](https://android.googlesource.com/platform/system/extras/+/master/simpleperf/doc/README.md) which can profile any Android process. Simpleperf is mostly a drop-in replacement for the Linux `perf` tool. Android Studio CPU profiler also uses `simpleperf` internally.

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

You can convert the `perf.data` file to one of the format supported by Firefox Profiler.

#### Option 1: Simpleperf trace file

Convert `perf.data` to the Simpleperf trace file format. You can also modify this command to provide proguard mapping file or unstripped SOs to symbolicate.

```bash
# Convert perf.data to perf.trace
# If on Mac/Windows, use simpleperf host executable for those platforms instead.
./bin/linux/x86_64/simpleperf report-sample --show-callchain --protobuf -i perf.data -o perf.trace
```

#### Option 2: Using gecko_profile_generator.py

Then convert to a Gecko Profile (Firefox Profiler) format, using [`gecko_profile_generator.py`](https://android.googlesource.com/platform/system/extras/+/master/simpleperf/doc/scripts_reference.md#gecko_profile_generator_py):

```bash
./gecko_profile_generator.py | gzip > profile.json.gz
```

`gecko_profile_generator.py` takes the `perf.data` file that was written before as its implicit input.

### Step 3: View the profile in profiler.firefox.com

Load the `perf.trace` or `profile.json.gz` created in previous step into [profiler.firefox.com](https://profiler.firefox.com), using drag-and-drop or "Load a profile from file".

## See also

The tips in [Perf Profiling for Linux](guide-perf-profiling.md).
