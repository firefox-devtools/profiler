# Profiling Firefox Startup & Shutdown

## Startup

Before starting, make sure the profiler's popup is already present. Otherwise
please go to https://profiler.firefox.com to add it first to your Firefox.

1. Start your Firefox with the environment variable `MOZ_PROFILER_STARTUP=1` set. This way, the profiler is started as early as possible during startup.

   This can also be done inline when running Firefox [Mach](https://firefox-source-docs.mozilla.org/mach/):

   ```bash
   $ MOZ_PROFILER_STARTUP=1 ./mach run
   ```

2. Then capture the profile using the popup, as usual.

Startup profiling does not use the settings that you configured in the `about:profiling`. It uses settings that can be configured with the environment variables `MOZ_PROFILER_STARTUP_ENTRIES`, `MOZ_PROFILER_STARTUP_INTERVAL`, and more:

- If it looks like the buffer is not large enough, you can tweak the buffer size with the env var `MOZ_PROFILER_STARTUP_ENTRIES`. This defaults to 1000000, which is 9MB. If you want 90MB, use 10000000, and for 180MB, use 20000000, which are good values to debug long startups.

- If you'd like a coarser resolution, you can also choose a different interval using `MOZ_PROFILER_STARTUP_INTERVAL`, which defaults to 1 (unit is millisecond). You can't go below 1 ms, but you can use e.g. 10 ms.

- More environment variables are available to control the profiler settings. They can be listed by setting `MOZ_PROFILER_HELP=1` and running Firefox from a command line inside a terminal; Firefox will exit immediately, and display all accepted variables in the terminal.

## Shutdown

1. Start your Firefox with the environment variable `MOZ_PROFILER_SHUTDOWN=<filename>` set, where `<filename>` is the name of the file where the recorded profile should be saved.

2. Start the profiler using the popup, then close Firefox.

3. The file you specified will contain the recorded profile. Load it through the [profiler.firefox.com](https://profiler.firefox.com) interface by either drag and drop or the file upload interface.

For startup profiling, similar to [startup profiling on Desktop](https://developer.mozilla.org/en-US/docs/Mozilla/Performance/Profiling_with_the_Built-in_Profiler#Profiling_Firefox_Startup), you will need to manually set some `MOZ_PROFILER_STARTUP*` environment variables. The way to do this varies based on the app you want to profile (more details below). Once the app has been started with these environment variables, the profiler will be running. Then you can connect to the app using `about:debugging` as usual, and capture the profile with the regular UI.

## Firefox for Android

First, you'll need to use [the general information about profiling on Android](./guide-remote-profiling.md).
Then you can follow the additional instructions below.

### Startup profiling GeckoView-example (and Fennec)

If you have compiled GeckoView-example locally, you can launch it with `./mach run` and specify environment variables as follows:

```bash
./mach run --setenv MOZ_PROFILER_STARTUP=1 \
           --setenv MOZ_PROFILER_STARTUP_INTERVAL=5 \
           --setenv MOZ_PROFILER_STARTUP_FEATURES=js,stackwalk,screenshots,ipcmessages,java,processcpu,cpu \
           --setenv MOZ_PROFILER_STARTUP_FILTERS="GeckoMain,Compositor,Renderer,IPDL Background"
```

Alternatively, if you have installed GeckoView-example from another source, you can launch it from the command line using `adb` with environment variables specified like this:

```bash
adb shell am start -n org.mozilla.geckoview_example/.App \
    --es env0 MOZ_PROFILER_STARTUP=1 \
    --es env1 MOZ_PROFILER_STARTUP_INTERVAL=5 \
    --es env2 MOZ_PROFILER_STARTUP_FEATURES=js,stackwalk,screenshots,ipcmessages,java,processcpu,cpu \
    --es env3 MOZ_PROFILER_STARTUP_FILTERS="GeckoMain,Compositor,Renderer,IPDL Background"
```

### Startup profiling Fenix

Fenix has a [different way](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/automation.html#reading-configuration-from-a-file) to specify environment variables: it uses a yaml file.

The easiest way to set up startup profiling is to run the `<mozilla-central-repo>/mobile/android/fenix/tools/setup-startup-profiling.py` script. For example:

```bash
./mobile/android/fenix/tools/setup-startup-profiling.py activate nightly  # To activate startup profiling on nightly.
./mobile/android/fenix/tools/setup-startup-profiling.py deactivate beta  # To deactivate startup profiling on beta.
```

If the app is uninstalled or the device is restarted, the `activate` command may need to be re-run. The script is hard-coded to use a default configuration file with default profiling arguments. If you wish to change these arguments or use a non-standard app ID, modify the script locally or read below.

If you don't want to check out [mozilla-central](https://hg.mozilla.org/mozilla-central/), you should be able to download [the script standalone](https://hg.mozilla.org/mozilla-central/raw-file/tip/mobile/android/fenix/tools/setup-startup-profiling.py) and execute it.

#### Manual configuration

The filename of the YAML file mentioned above depends on the bundle ID of your Fenix app. The instructions below assume you want to profile the Fenix Nightly app, with the bundle ID `org.mozilla.fenix`.

1.  Create a file with the name `org.mozilla.fenix-geckoview-config.yaml` on your desktop machine and content of the following form:

    ```
    env:
      MOZ_PROFILER_STARTUP: 1
      MOZ_PROFILER_STARTUP_INTERVAL: 5
      MOZ_PROFILER_STARTUP_FEATURES: js,stackwalk,screenshots,ipcmessages,java,processcpu,cpu
      MOZ_PROFILER_STARTUP_FILTERS: GeckoMain,Compositor,Renderer,IPDL Background
    ```

2.  Push this file to the device with `adb push org.mozilla.fenix-geckoview-config.yaml /data/local/tmp/`.
3.  Run `adb shell am set-debug-app --persistent org.mozilla.fenix` to make sure the file is respected.

From now on, whenever you open the Fenix app, Gecko will be profiling itself automatically from the start, even if remote debugging is turned off. Then you can enable remote debugging, connect to the browser with `about:debugging`, and capture the profiling run.

You can delete the file again when you want to stop this behavior, e.g. using `adb shell rm /data/local/tmp/org.mozilla.fenix-geckoview-config.yaml`.

[Here's an example profile captured using this method](https://perfht.ml/3bKTFCG).

Refer to the [Reading configuration from a file](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/automation.html#reading-configuration-from-a-file) section of the GeckoView docs for more details.

### Profiling App Link startup

Fenix can be launched with a URL as follows (assuming a debug Fenix build):

```
adb shell am start-activity -d "https://www.mozilla.org/" \
 -a android.intent.action.VIEW org.mozilla.fenix.debug/org.mozilla.fenix.IntentReceiverActivity
```

When combined with the startup profiling `.yaml` file as described in the previous section, this allows profiling GeckoView during the App Link startup path. This is the scenario of a user opening a link from a different Android app in the default browser.

Startup from App Link is the most important GeckoView startup scenario. In this scenario, GeckoView startup is directly in the critical path between the user action (tapping the link) and the first useful result (the web page being shown on the screen). This is different from the scenario of launching Fenix from the home screen - in that case, Fenix can show meaningful content even before Gecko is initialized, so Gecko's startup time is not as crucial to the experience.
