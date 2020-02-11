# Remote profiling on Android

You can use the Firefox Profiler to investigate performance issues on Android, not just Windows, macOS and Linux.

In order to do so, you need both your phone with the mobile Gecko-based browser, and machine running Firefox Desktop. You also need a USB connection between the two devices. Then you can use [about:debugging](https://developer.mozilla.org/en-US/docs/Tools/about:debugging) in Firefox Desktop to connect to the phone and control profiling from there. The result will be shown in Firefox Desktop.

## Which mobile browser?

(The following is true as of February 2020.)

You probably want to profile [Firefox Preview Nightly](https://play.google.com/store/apps/details?id=org.mozilla.fenix.nightly) from the Google Play Store. Read on for more details, or skip to the next section if you already know exactly which browser you want to profile.

Mozilla's current development efforts on mobile are focused on GeckoView and Firefox Preview (["Fenix"](https://github.com/mozilla-mobile/fenix)). You can [install a Nightly version of Fenix from the Google Play Store](https://play.google.com/store/apps/details?id=org.mozilla.fenix.nightly). This is the preferred profiling target for the following reasons:

 - It's the product we want to ship and are actively working on.
 - It uses a [recent](https://github.com/mozilla-mobile/android-components/blob/master/buildSrc/src/main/java/Gecko.kt#L9) version of Gecko and updates frequently and automatically.
 - It's a very usable browser.

The other reasonable profiling target is something called ["GeckoView-example"](https://searchfox.org/mozilla-central/source/mobile/android/geckoview_example). This is a small Android app that is basically just a demo of GeckoView and doesn't have much UI. You can [download the most recent build of GeckoView-example.apk from TaskCluster](https://firefox-ci-tc.services.mozilla.com/api/index/v1/task/gecko.v2.mozilla-central.nightly.latest.mobile.android-api-16-opt/artifacts/public/build/geckoview_example.apk), or you can compile Gecko yourself and [push Geckoview-example to the phone using `mach run`](https://mozilla.github.io/geckoview/contributor/for-gecko-engineers#geckoview-example-app) or [using Android Studio](https://mozilla.github.io/geckoview/contributor/geckoview-quick-start#build-using-android-studio). In fact, if you're working on Gecko, this is the most low-friction workflow if you want to quickly verify the performance impact of your changes on Android.

In general, profiling Fenix is preferable over profiling GeckoView-example because you'll be able to see impact from Fenix-specific performance issues. If you're compiling and modifying Gecko locally, you can create a version of Fenix that uses your custom Gecko [by making a small tweak to a `local.properties` file in Fenix](https://mozilla.github.io/geckoview/contributor/geckoview-quick-start#dependency-substiting-your-local-geckoview-into-a-mozilla-project).

As for the other Gecko-based Android products, [the old Firefox for Android ("Fennec")](https://play.google.com/store/apps/details?id=org.mozilla.fennec_aurora&hl=en_CA) and [Firefox Focus](https://play.google.com/store/apps/details?id=org.mozilla.focus) are based on outdated versions of Gecko and are only of historical interest.

You can also profile [the "reference browser"](https://github.com/mozilla-mobile/reference-browser) or [Firefox Reality](https://mixedreality.mozilla.org/firefox-reality/).

## Setup

### Enable remote debugging on the mobile device

Your device needs to be connected to your computer before recording. You also need to have your Gecko-based Android app (such as Firefox Preview) running and set up for remote debugging via USB. This usually requires **two** settings:

 - Android itself needs to be configured to allow remote debugging over USB. This can be done in the system settings after entering "developer mode", which can be done by tapping on the Android build number repeatedly. See [the Android documentation](https://developer.android.com/studio/debug/dev-options.html) for details.
 - The app needs to be configured to allow remote debugging. There's usually a checkbox in the app's settings menu for that. The GeckoView-example app doesn't have a checkbox but it has remote debugging enabled by default.

### Prepare `about:debugging`

To profile a Gecko Android build, you have to connect it to a Desktop Firefox browser. Please use [Firefox Nightly](https://www.mozilla.org/en-US/firefox/channel/desktop/#nightly) for this.

* Open the `about:debugging` page in Desktop Firefox by typing `about:debugging` in the URL bar, or via Tools > Web Developer > Remote Debugging.
* If necessary, click "Enable USB Devices".

## Recording

On `about:debugging`, find your device/browser in the sidebar on the left and connect to it. If your device is not listed, check the following things:

 - Is USB debugging enabled in the Android system preferences?
 - Is the browser you want to profile running? Try navigating to a page in order to make sure that Gecko has been initialized.
 - Is remote debugging enabled in the browser on the phone? If you've recently pushed a new version of this app to your phone, the settings from the previous version may have been lost, so you may need to enable the prefs again.
 - Is your phone's screen unlocked?
 - Double-check your cable connections.
 - If you have `adb` on your Desktop machine, check if `adb devices` sees the phone. If not, try to fix that first.

Once you have connected to the phone browser successfully, read on.

Click the sidebar item for your phone / browser. Then, in the main section of the page, click the *Profile Performance* button.

Make any necessary adjustments in the presented options, like threads to sample or profiler features to enable, and then click *Start recording*. Perform the interactions you intend to profile on the Android device and then click *Capture Recording* in the Performance panel. A new tab will open in [https://profiler.firefox.com/](https://profiler.firefox.com/) with the collected profile ready for inspection.

![A screenshot of about:debugging after connecting](./images/about-debugging-remote.png)
![A screenshot of about:debugging after clicking Profile Performance](./images/about-debugging-remote-profiling-panel.png)

## Symbols and symbol sources

If you've been profiling a browser from the Google Play Store, your profile should contain fully symbolicated C++ call stacks at least for libxul.so. If it doesn't, check the following:

 - Are you profiling a "Nightly" GeckoView build? A common mistake is to profile a regular "build" build from treeherder, i.e. one that was not compiled with the "nightly" configuration. Unfortunately, those regular treeherder builds do not upload symbol information to the Mozilla symbol server. Please use a different build in that case.
 - Are you profiling a build from the tryserver or a local build? Read on below for how to obtain symbol information in those cases.

### Try builds

If you want to profile an Android build that the tryserver created for you, you have to kick off a "Sym" job on treeherder: Using treeherder's *Add new jobs* UI, schedule a "Sym" job for each platform whose "B" job you want symbols for. (And "SymN" if you have an "N" job you want symbols for, i.e. a build job with the "nightly" configuration.) These jobs gather symbol information from the corresponding build job and upload it to the Mozilla symbol server so that the Firefox Profiler can use it.

### Local builds

If you've compiled an Android Gecko build locally, and want to profile it, you have to jump through one small extra hoop: Before profiling, in the *Profile Performance* panel in `about:debugging`, open the *Local build* section and add your Android build's objdir to the list. Then profile as usual, and you should be getting full symbol information.

## Tips

* Enable the "Screenshots" feature before profiling. Then you can see what's going on on the screen during your profiling run, which can be extremely helpful.
* Limit the duration of the profiling run. This will cut down on the profile size, which will reduce the time you have to wait when you click "Capture Profile". Smaller profiles are also less likely to crash the app due to memory limitations.
* Avoid clicking on any of the open tabs that are listed on the `about:debugging` page. Doing so will open a toolbox and add overhead by initializing content-side devtools code. For that reason, the profiling panel is separate from the toolbox.
* Choose a more relaxed profiling interval in order to reduce profiling overhead. 2ms to 5ms work well. This will give you less data but more accurate timings.
* To get maximally-realistic timings, consider using the "No Periodic Sampling" feature: This will cut down profiling overhead dramatically, but you won't have any stacks. If your workload is reproducible enough, you can take two profiles: one with stacks and one without. Then you can take your timings from the former and your information from the latter.
* If the recording doesn't start after clicking the start button, or if the button is inactive or in an otherwise confused state, it might be necessary to disconnect and reconnect to the phone to reset some state.
