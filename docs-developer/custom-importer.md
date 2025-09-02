# Writing a Custom Profile Importer

The Firefox Profiler supports a few [external profile formats](../src/profile-logic/import) that the profiler imports by converting them to either the [Gecko profile format](./gecko-profile-format.md) or the [processed profile format](./processed-profile-format.md). The good news is that once an importer targets a specific profile version, the Firefox Profiler will always upgrade that profile to the currently supported format.

## Useful Docs

- [Gecko profile format docs](./gecko-profile-format.md)
- [processed profile format](./processed-profile-format.md)

## Useful code links

- [Gecko profile format type definition](../src/types/gecko-profile.ts)
- [processed profile format type definition](../src/types/profile.ts)
- [marker payload type definitions](../src/types/markers.ts)
- [profiler data structure utilities](../src/profile-logic/data-structures.ts)
- [existing importers](../src/profile-logic/import)

## How to write a profile converter

The rest of this guide will assume you are targeting the processed profile format. From a high level point of view, the profile is broken down into the basic profile, with meta information, and a list of threads. These threads are grouped in the UI by their PID. The UI also dynamically generates a few "tracks" from other data sources, like the memory track or screenshot track. This guide primarily documents working with threads.

A good place to start would probably be to view some of the existing [blank profile generating functions](../src/profile-logic/data-structures.ts).

## Some concepts used in the data structures

The profile format uses a lot of indexes into other data structures. For instances, this is how you would extract out a function name from a profile. (This should work from the web console when viewing a profile on profiler.firefox.com.)

```js
{
  // Get the first sample out of the first thread:
  const threadIndex = 0;
  const sampleIndex = 0;

  const thread = profile.threads[threadIndex];

  // Look up the stack index from the samples table.
  const stackIndex = thread.samples.stack[sampleIndex];
  console.log({ stackIndex });

  // Look up the frame from the stack table.
  const frameIndex = thread.stackTable.frame[stackIndex];
  console.log({ frameIndex });

  // Look up the function from the frame table.
  const funcIndex = thread.frameTable.func[frameIndex];
  console.log({ funcIndex });

  // Look up the string index from the func table.
  const stringIndex = thread.funcTable.name[funcIndex];
  console.log({ stringIndex });

  console.log(
    'Function name of the first sample:',
    thread.stringTable.getString(stringIndex)
  );
}
```

It is probably a good iea to read up some on profile format docs for more information on how this structure is used. See the [Gecko profile format](gecko-profile-format.md) and the [processed profile format](processed-profile-format.md) docs.

## Tips

- Ensure that the `pid` value points to the proper threads to nest threads in the timeline.
- Processed profiles have their timestamps adjusted so that all processes use the same timeline.
- Make sure and adjust the timing for child processes. During profile processing, the Firefox Profiler adjusts Gecko profiles timings, so that markers and samples take into account the differences in start time (via `geckoProfile.meta.startTime`). See [src/profile-logic/process-profile.ts](https://github.com/firefox-devtools/profiler/blob/3067dda9cbf5807948aef149e18caf4e8870ed25/src/profile-logic/process-profile.js#L997-L1010) for some examples.

## Samples

The call tree, flame graph, and stack chart all use the samples data to generate the reports. If your data is shaped like sample data, it can be convenient to shove the information in there. At the time of this writing we don't support variable durations. It's assumed 1 sample is equal in length to the sampling interval. This is probably going to change soon.

Most likely the profile formats will assume that there is at least one sample in a thread. It might be necessary to fill out the samples with fake time data if your format isn't needing samples. It's a good idea to push on 1 sample for the start, and 1 for the end.

## Markers

Markers are used in the marker chart, marker table, and for various visualization in the header's timeline. For instance they are drawn as solid squares. Screenshots are encoded as [ScreenshotPayload](https://github.com/firefox-devtools/profiler/search?q=ScreenshotPayload&unscoped_q=ScreenshotPayload) and extracted as a separate track. Markers can be used to encode some tracing types of data, as they can have start and end times.

One important distinction in the UI is that there is some processing going on everytime you view a profile. The importer should target the [RawMarkerTable](https://github.com/firefox-devtools/profiler/blob/3067dda9cbf5807948aef149e18caf4e8870ed25/src/types/profile.js#L123-L128), while the UI surfaces the `filteredMarkers` on the window object. The filtered markers do some processing to match up start and end markers. This is a bit beyond the scope of this document, but the type definitions should explain things a bit more. It could be a source of confusion when writing and working with markers.
