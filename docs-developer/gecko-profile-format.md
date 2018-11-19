# Gecko profile format

Profile data visualized in perf.html is obtained from the [Gecko Profiler][nsIProfiler], a C++ component inside of Gecko. perf.html assumes that the Gecko Profiler add-on will activate the Gecko Profiler, gather the data, and then provide it to the client. This document talks about the Gecko profile format, which is distinct from the format that the perf.html client uses. The plan is to migrate the Gecko profile format closer and closer perf.html's desired processed profile format.

## Running the Gecko Profiler independently from the add-on and client

The Gecko Profiler can be run on its own by executing the following code from a browser chrome context, like from the Browser Console in Firefox (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>):

```js
(() => {
  const settings = {
    entries: 1000000,
    interval: 0.4,
    features: ["js", "stackwalk", "threads", "leaf"],
    threads: ["GeckoMain", "Compositor"]
  };

  Services.profiler.StartProfiler(
    settings.entries,
    settings.interval,
    settings.features,
    settings.features.length,
    settings.threads,
    settings.threads.length
  );

  setTimeout(() => {
    Services.profiler.getProfileDataAsync().then(profile => {
      for (let i = 0; i < profile.threads.length; i++) {
        const thread = profile.threads[i];
      }
      console.log(profile);
      // Stopping the profiler will delete the data in the buffer.
      Services.profiler.StopProfiler();
    });
  }, 500);
})();
```

# Source data format

The source data format is de-duplicated to make it quicker to transfer in the JSON format. This specific format is documented in [ProfileBufferEntry.h]. In order to actually work with the data it must be re-mapped or have an interface wrapped around it to fetch all of the relevant information. The following is the general shape of the returned data in pseudo-code.

```js
{
  // Key/pair meta values about the profile.

  meta: {
    version: 5,
    interval: 0.4,
    stackwalk: 1,
    startTime: 1477063882018.4387,
    shutdownTime: null,
    processType: 0,
    platform: "Macintosh",
    oscpu: "Intel Mac OS X 10.12",
    misc: "rv:52.0",
    abi: "x86_64-gcc3",
    toolkit: "cocoa",
    product: "Firefox",
    extensions: {
      schema: {
        id: 0,
        name: 1,
        baseURL: 2
      },
      data: [
        ["geckoprofiler@mozilla.com", "Gecko Profiler", "moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/"]
      ]
    }
  },

  // Array of shared library data.

  libs: [
    {
      "start": 4461400064,
      "end": 4461424640,
      "offset": 0,
      "name": "firefox",
      "path": "/Applications/FirefoxNightly.app/Contents/MacOS/firefox",
      "debugName": "firefox",
      "debugPath": "/Applications/FirefoxNightly.app/Contents/MacOS/firefox",
      "breakpadId": "E54D3AF274383256B9F6144F83F3F7510"
    },
    ...
  ],

  // Array describing periods of time during which no samples were collected.

  pausedRanges: [
    {
      "startTime": 6547.127094,
      "endTime": 6659.796075,
      "reason": "collecting"
    },
    ...
  ]

  // All of the threads that were profiled.

  threads: [
    {
      //--------------------------------------------------------
      // Thread description properties
      //--------------------------------------------------------

      // The name of the thread (see Sampler::RegisterCurrentThread)
      name: "GeckoMain", // String

      // The process type string of this process, XRE_ChildProcessTypeToString(XRE_GetProcessType())
      // See http://searchfox.org/mozilla-central/rev/2fc8c8d483d9ec9fd0ec319c6c53807f7fa8e8a2/xpcom/build/nsXULAppAPI.h#396
      processType: "default",

      // Optional friendly process name. "Parent Process" or ContentChild::GetProcessName.
      processName: "Parent Process",

      // The thread ID
      tid: 7442229,

      // The process's PID
      pid: 51580,

      // The time when this thread was registered with the profiler
      registerTime: 23.841461000000002,

      // The time when this thread was unregistered from the profiler, or null
      unregisterTime: null,

      //--------------------------------------------------------
      // Profile data
      //--------------------------------------------------------

      // Markers represents events within the browser. These can be a wide variety of
      // events from different systems within the browser. For instance these can
      // include GC pauses, Paints, Reflows, DOM events, etc.

      markers: {
        schema: {
          name: 0,
          time: 1,
          data: 2
        },
        data: [
          [
            24,           // index into stringTable - Marker name
            37070.186708, // milliseconds since since profile.meta.startTime
            {             // arbitrary JSON about the marker
              "type": "tracing",
              "category": "Paint",
              "interval": "start"
            }
          ],
          ...
        ]
      },

      // The profiler regularly samples the current frame on the call stack. These
      // samples provide a picture into what is executing through the time of the
      // profile. These can be C++ frames or JS frames.

      samples: {
        schema: {
          stack: 0,
          time: 1,
          responsiveness: 2,
          rss: 3,
          uss: 4,
        },
        data: [
          [
            1,             // index into stackTable - The current stack of the sample.
            37067.409299,  // milliseconds since since profile.meta.startTime
            1.437998,      // milliseconds since the last event was processed in this
                           // thread's event loop at the time that the sample was taken
            ...            // TODO
          ]
        ]
      },

      //--------------------------------------------------------
      // Table data, this information is referenced by index
      //--------------------------------------------------------

      // A table of frame data. Each frame represents the context for a function's
      // execution. The stackTable uses this frame information to build the call stack
      // of a profile sample.

      frameTable: {
        schema: {
          location: 0,
          relevantForJS: 1,
          implementation: 2,
          optimizations: 3,
          line: 4,
          column: 5,
          category: 6
        },
        data: [
          [
            18,    // index into stringTable, points to strings like:
                   // JS: "Startup::XRE_Main"
                   // C++: "0x7fff7d962da1"
            false, // for label frames, whether this label should be shown in "JS only" stacks
            40,    // for JS frames, an index into the string table, usually "Baseline" or "Ion"
            null,  // JSON info about JIT optimizations.
            1536,  // The line of code
            16     // int bitmask of the category
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
          ],
          ...
        ]
      },

      // A table of stacks. Each entry contains references to the current frame and
      // the parent frame (if one exists). This can then be used to reconstruct
      // the call stack.

      stackTable: {
        schema: {
          frame: 0,
          prefix: 1
        },
        data: [
          [
            0,   // The current frame: index of the frame in the frameTable
            null // The rest of the stack: Index of the stack in the stackTable, or null
          ],
          ...
        ]
      },

      // A list of arbitrary strings used within the profile.

      stringTable: ["(root)", "0x109eba3b4", "Events::ProcessGeckoEvents", ...],

    },
    ...
  ],

  // An array of profiles from other processes that were associated with this process.
  // For example, in Firefox, the profile from the parent process has a profiles from
  // the content processes in its processes array.
  processes: [
    {
      meta: ...,
      libs: ...,
      threads: ...
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
[ProfileBufferEntry.h]: https://dxr.mozilla.org/mozilla-central/rev/b043233ec04f06768d59dcdfb9e928142280f3cc/tools/profiler/core/ProfileBufferEntry.h#322-411
