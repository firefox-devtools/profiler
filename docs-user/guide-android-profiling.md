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

Then convert to a Gecko Profile (Firefox Profiler) format, using [`gecko_profile_generator.py`](https://android.googlesource.com/platform/system/extras/+/master/simpleperf/doc/scripts_reference.md#gecko_profile_generator_py):

```bash
./gecko_profile_generator.py | gzip > profile.json.gz
```

`gecko_profile_generator.py` takes the `perf.data` file that was written before as its implicit input.

### Step 3: View the profile in profiler.firefox.com

Load `profile.json.gz` into [profiler.firefox.com](https://profiler.firefox.com), using drag-and-drop or "Load a profile from file".

## See also

The tips in [Perf Profiling for Linux](guide-perf-profiling.md).
