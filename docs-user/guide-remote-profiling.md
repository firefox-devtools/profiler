# Remote profiling on Android

You can use perf.html to investigate performance issues on Android, not just Windows, macOS and Linux. To profile Firefox for Android (or a remote Firefox instance on a different machine), you currently have to make a configuration change to the Firefox Developer Tools.

# Setup

## Enable new Performance panel

* Open the `about:config` page in Firefox (Nightly is recommended)
* Set `devtools.performance.new-panel-enabled` to `true`

## Enable remote debugging on mobile device

You need to have Firefox for Android running and set up for remote debugging via [USB](https://developer.mozilla.org/docs/Tools/Remote_Debugging/Debugging_Firefox_for_Android_with_WebIDE) or via [WiFi](https://developer.mozilla.org/docs/Tools/Remote_Debugging/Debugging_Firefox_for_Android_over_Wifi). For profiling over USB, you need to have the device connected to your computer before recording. For profiling over WiFi ensure that both mobile device and computer are on the same wireless network.

# Recording

In desktop Firefox open `Tools > Web Developer > WebIDE`, find your device in the top right corner and connect to it. Select *Performance* from the action list on the right sidebar.

Make any necessary adjustments in the presented options, like threads to sample or profiler features to enable, and then click *Start recording*. Perform the interactions you intend to profile on the Android device and then click *Stop and grab the recording* in the Performance panel. A new tab will open in https://perf-html.io with the collected profile ready for inspection.

![A screenshot of the new performance panel](./images/new-performance-panel.png)

# Tips

* Avoid opening any other panels besides the Performance panel, to reduce the overhead of activated panels.
* After connecting to the device, do not select *Main Process* or any of the open tabs from the list of targets on the left.
* If WebIDE automatically reconnects to a debugging target from a previous session, disconnect, uncheck the two checkboxes in the WebIDE preferences (`Project -> Preferences`) and reconnect to the device.
