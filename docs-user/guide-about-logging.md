# Recording logs with about:logging

Firefox has a logging system, often referred to as `MOZ_LOG`, that many Gecko components use to output detailed information about what they are doing. The `about:logging` page lets you enable these logs at runtime, without having to restart Firefox with environment variables. It can also record the log messages directly into a Firefox Profiler profile, so that you can look at them alongside the samples and markers of the same time range.

This works on desktop and on Firefox for Android, which makes it especially useful to capture logs and a profile directly on an Android device, without the need of a PC.

More details about the logging system itself can be found in the [Gecko logging documentation](https://firefox-source-docs.mozilla.org/xpcom/logging.html).

## Usage instructions

### Configure the log modules

- Open a new tab and go to `about:logging`.
- Either pick one of the presets from the list (for example "Networking"), or type the log modules you are interested in into the text field, as a comma-separated list of `module:level` pairs, for example `nsHttp:5,cache2:5`. The levels go from 1 (errors only) to 5 (verbose).
- Optionally, the page can be opened with its settings already filled in by adding them to the URL, for example `about:logging?modules=nsHttp:5,cache2:5` or `about:logging?preset=networking`. This is handy to share a configuration with someone.

### Choose the output

In the "Logging output" section, select "Logging to the Firefox Profiler". The log messages will then be recorded as markers in a profile instead of being written to a file.

### Record

- Click "Start Logging". This starts the profiler with the configured log modules.
- Reproduce the problem you want to investigate.
- Go back to `about:logging` and click "Stop Logging".

On desktop, the profile is then opened in the Firefox Profiler, like a profile captured with the profiler button. On Firefox for Android, the profile is uploaded and a link to it is displayed on the page, so that you can open it or share it.

## Looking at the logs in a profile

Each log message is recorded as a marker of type `Log` on the thread that emitted it, named after its log module. You can find them in the [Marker Table](./guide-ui-tour-panels.md#the-marker-table) of the corresponding thread. Use the search field to filter the markers, for example by module name such as `nsHttp`, or by any text contained in the log message.

If you prefer to read the logs in the regular `MOZ_LOG` text format, open the web console of the browser while viewing the profile and run:

```js
copy(extractGeckoLogs());
```

This copies all the log messages of the current range selection to the clipboard, sorted by time. You can also save them to a file with:

```js
saveToDisk(extractGeckoLogs(), 'logs.txt');
```
