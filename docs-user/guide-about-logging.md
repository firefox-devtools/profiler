# Recording logs with about:logging

Firefox has a logging system called `MOZ_LOG` that lets Gecko code write
detailed log statements for a module (for example `nsHttp` for networking, or
`cubeb` for audio). Logging is usually turned on with environment variables,
but the `about:logging` page lets you turn it on from inside the browser,
without restarting it.

`about:logging` can send log statements to the Firefox Profiler. Each log
statement on a profiled thread is recorded as a marker, so the logs show up
next to samples and other markers in the profile. This is often easier than
logging to a file:

- It works in all processes, including sandboxed content processes, which can't
  write log files to disk.
- The result is a single profile that can be uploaded and shared, for example
  in a Bugzilla bug.
- It works on Firefox for Android, where getting log files off the device is
  hard.

More details about `MOZ_LOG` itself can be found in the
[Gecko logging documentation](https://firefox-source-docs.mozilla.org/xpcom/logging.html).

## Recording a profile with logs

1. Open a new tab and type `about:logging` in the URL bar.
2. Pick a preset from the drop-down that matches what you want to look at
   (for example, networking or media playback). A preset selects a set of log
   modules, and the profiler settings (threads and features) that go with them.
   If no preset fits, you can type your own list of modules in the text field,
   using the `MOZ_LOG` syntax, for example `nsHttp:5,cookie:5`.
3. Choose to send the logs to the Firefox Profiler as the output.
4. Start logging, then reproduce the problem.
5. Stop logging. The profile is captured and opened in the Firefox Profiler,
   from where you can upload it like any other profile.

## Log levels

Each module in the `MOZ_LOG` string is followed by a level. Higher levels
include all the lower ones and produce more output:

| Level | Name     |
| ----- | -------- |
| 0     | Disabled |
| 1     | Error    |
| 2     | Warning  |
| 3     | Info     |
| 4     | Debug    |
| 5     | Verbose  |

Some special options can also be added to the list. One that is useful with the
profiler is `profilerstacks`, which captures a stack for every log statement.
Keep in mind that this adds overhead.

## Configuring about:logging with URL parameters

The page can be configured from its URL, which is handy to share a setup with
someone else, or to type it quickly on a phone. The supported parameters are:

- `preset`: the name of a logging preset.
- `modules`: a list of log modules, using the `MOZ_LOG` syntax.
- `threads`: the threads that the profiler should record.
- `output`: either `profiler` or `file`.
- `profiler-preset`: the name of a profiler preset.

When a preset is selected, `modules` and `threads` override only that part of
the preset. For example, this URL uses the media playback preset, but only
enables the listed log modules:

```
about:logging?output=profiler&preset=media-playback&modules=cubeb:4,AudioSinkWrapper:4,AudioSink:4
```

## Using about:logging on Firefox for Android

`about:logging` is available on Firefox for Android too. Type `about:logging` in
the URL bar and follow the same steps as on desktop. Logging to the profiler is
the most practical choice on Android, because you don't need a computer or to
fetch log files from the device. This complements the profiler controls that
are available in the
[secret settings](./guide-profiling-android-directly-on-device.md).

## Looking at the logs in the profile

Log statements are recorded as markers, named after their log module. You can
find them in the [Marker Chart and Marker Table](./guide-ui-tour-panels.md),
and use the search field to filter them by module name or message.

To get the logs out of the profile as text, open the Web Console on the
profiler page and run `copy(extractGeckoLogs())`. This copies the logs within
the current range selection to the clipboard, using the `MOZ_LOG` format. You
can also save them to a file with `saveToDisk(extractGeckoLogs(), 'logs.txt')`.
