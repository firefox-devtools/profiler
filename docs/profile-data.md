# Profile Data

The profile data is obtained from the [nsIProfiler][nsIProfiler] component in Gecko. The following code can be run from a browser chrome context, like from the Browser Console in Firefox (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>):

```js
const profiler = Components.classes["@mozilla.org/tools/profiler;1"]
  .getService(Components.interfaces.nsIProfiler);

const settings = {
  entries: 1000000,
  interval: 0.4,
  features: ["js", "stackwalk", "threads", "leaf"],
  threads: ["GeckoMain", "Compositor"]
}

profiler.StartProfiler(
  settings.entries,
  settings.interval,
  settings.features,
  settings.features.length,
  settings.threads,
  settings.threads.length
);

setTimeout(() => {
  console.log(profiler.getProfileData());
  // Stopping the profiler will delete the data.
  profiler.StopProfiler();
}, 500);
```

# Source data format

The source data format is de-duplicated to make it quicker to transfer in the JSON format. This specific format is documented in [ProfileEntry.h]. In order to actually work with the data it must be re-mapped or have an interface wrapped around it to fetch all of the relevant information. The following is the general shape of the returned data in pseudo-code. For readability below any property of the form `{ schema: {}, data: [] }` has been reworked with the form `[SchemaData({ prop1, prop1 }), ...]` as if the data were reassembled according to the given schema.

```js
{
  // JSON string of the executable library data. This needs to be JSON parsed a
  // second time.

  libs: `[{
    {
      "start": 4461400064,
      "end": 4461424640,
      "offset": 0,
      "name": "/Applications/FirefoxNightly.app/Contents/MacOS/firefox",
      "breakpadId": "E54D3AF274383256B9F6144F83F3F7510"
    },
    ...
  }]`,

  // Key/pair meta values about the profile.

  meta: {
    version: 3,
    interval: 0.4,
    stackwalk: 1,
    startTime: 1477063882018.4387,
    processType: 0,
    platform: "Macintosh",
    oscpu: "Intel Mac OS X 10.12",
    misc: "rv:52.0",
    abi: "x86_64-gcc3",
    toolkit: "cocoa",
    product: "Firefox"
  },

  // All of the threads that were profiled.

  threads: [
    {
      //--------------------------------------------------------
      // Profile data
      //--------------------------------------------------------

      // Markers represents events within the browser. These can be a wide variety of
      // events from different systems within the browser. For instance these can
      // include GC pauses, Paints, Reflows, DOM events, etc.

      markers: [
        SchemaData({
          name // index into stringTable - Marker name
          time // milliseconds since since profile.meta.startTime, e.g. 37070.186708
          data // arbitrary JSON about the marker. e.g.
               // {
               //   "type": "tracing",
               //   "category": "Paint",
               //   "interval": "start"
               // }
        }),
        ...
      ],

      // The profiler regularly samples the current frame on the call stack. These
      // samples provide a picture into what is executing through the time of the
      // profile. These can be C++ frames or JS frames.

      samples: [
        SchemaData({
          stack,           // index into stackTable - The current stack of the sample.
          time,            // milliseconds since since profile.meta.startTime
                           // e.g 37067.409299
          responsiveness,  // milliseconds since the last event was processed in this
                           // thread's event loop at the time that the sample was taken
                           // e.g. 1.437998
          rss,             // TODO
          uss,             // TODO
          frameNumber,     // TODO
          power            // TODO
        }),
        ...
      ],

      //--------------------------------------------------------
      // Misc properties
      //--------------------------------------------------------

      // The thread ID - TODO: how is this useful?
      tid: 7442229,

      // The name of the thread (see Sampler::RegisterCurrentThread)
      name, // String e.g. "GeckoMain", "Compositor", etc.

      //--------------------------------------------------------
      // Table data, this information is referenced by index
      //--------------------------------------------------------

      // A table of frame data. Each frame represents the context for a function's
      // execution. The stackTable uses this frame information to build the call stack
      // of a profile sample.

      frameTable: [
        SchemaData({
          location, // index into stringTable, points to strings like:
                    // JS: "Startup::XRE_Main"
                    // C++: "0x7fff7d962da1"
          // JS Only:
          implementation, // TODO
          optimizations, // JSON info about JIT optimizations.
          line, // The line of code
          category // int bitmask of the category
            // 16 - js::ProfileEntry::Category::OTHER
            // 32 - js::ProfileEntry::Category::CSS
            // 64 - js::ProfileEntry::Category::JS
            // 128 - js::ProfileEntry::Category::GC
            // 256 - js::ProfileEntry::Category::CC
            // 512 - js::ProfileEntry::Category::NETWORK
            // 1024 - js::ProfileEntry::Category::GRAPHICS
            // 2048 - js::ProfileEntry::Category::STORAGE
            // 4096 - js::ProfileEntry::Category::EVENTS
            // 9000 - other non-bitmask category
        }),
        ...
      ],

      // A table of stacks. Each entry contains references to the current frame and
      // the parent frame (if one exists). This can then be used to reconstruct
      // the call stack.

      stackTable: SchemaData({
        frame, // The current frame: index of the frame in the frameTable
        prefix // The calling frame: Index of the frame in the frameTable
      }),

      // A list of arbitrary strings used within the profile.

      stringTable: ["(root)", "0x109eba3b4", "Events::ProcessGeckoEvents", ...],

    },
    ...
  ]
}
```

The problem with this provided format for the use in perf.html is that it creates a lot of little objects. Because of this GC pauses become a real issue. So rather than have a bunch of small objects that get passed around, the data is mapped into a new form. For instance looking at markers the data goes through the following mapping.

### Original data

```js
markers: {
  schema: {name: 0, time: 1, data: 2},
  data: [
    [1, 37070.186708, { ... }],
    [2, 37385.485834, { ... }],
    [5, 37471.444024, { ... }],
    ...
  ]
}
```

### Mapped data

```js
markers: {
  name: [1, 2, 5, ...],
  time: [37070.186708, 37385.485834, 37471.444024, ...],
  data: [{...}, {...}, {...}, ...],
}
```

While this format is a little more difficult to work with compared to mapping into the shape of `[{name, time, data}, {name, time, data}, ...]`, it has benefits in the speed of the perf.html client and the lack of GC pauses.

### Processed Profile Format

The threads of the processed profile use the above format and include the following keys:

Profile data:

 * samples
 * markers

Index-based table data:

 * resourceTable
 * frameTable
 * funcTable
 * stackTable
 * stringTable

Miscellaneous data:

 * name
 * libs
 * tid

Different frames can be created from the same function, and thus do not represent the unique set of functions. This function table is generated during perf.html's pre-processing step. Frames can provide additional information about the various ways the function was executed, while it's also useful to have a list of only the functions, so both types of information are retained.

```js
funcTable: {
  address: [ 65438929, 65632509, -1, ... ],
  isJS: [ false, false, true, ... ],
  name: [ 0, 1, 2, ... ], // Index into the string table, has the function name.
  resource: [ 0, 1, -1, ... ], // TODO, what does this represent?
  length: 6258,
}
```

[nsIProfiler]: https://dxr.mozilla.org/mozilla-central/source/tools/profiler/gecko/nsIProfiler.idl
[ProfileEntry.h]: https://dxr.mozilla.org/mozilla-central/rev/8464f02a2798cf9ff8759df712f2c77ec0b15d23/tools/profiler/core/ProfileEntry.h?offset=0#314-405
