# Potential performance data sources in Gecko

[profiler.firefox.com](https://profiler.firefox.com) is only a client, it doesn't actually create the data it displays and analyzes. This page documents, from a high level, the various systems that are available for recording performance data within Gecko.

## Gecko Profiler (aka SPS, nsIProfiler)

The profiler collects two types of information, samples and markers. The profiler is an internal component inside of Gecko. It stores all of profile information in a circular buffer, that when it gets full, the buffer starts to overwrite the old data with new data. This is a nice feature because it means the profiler can be left on indefinitely, allowing for the capture of a profile once some kind of interesting behavior happens. Once the user is done profiling then the data can be retrieved as a JSON blob. The profiler can be configuring to collect data from different specific threads, and it stores this information on a per-thread basis.

### Samples in the profiler

Samples are taken of the current executing function at a fixed but configurable interval, e.g. every 1 millisecond. These samples are collected and provide a general statistical view of where time was spent executing code. The more a function is executed, the more samples show up in the buffer. These samples include a variety of data including their call stacks, and information about the function name. In JavaScript a string is provided with the function name, the file location, and the line number. C++ functions only contain their memory address. [profiler.firefox.com](https://profiler.firefox.com) then must take the additional step of "symbolicating" these memory addresses, by looking up the original function names in a function symbol table that is specific to that individual build of Firefox or an individual library. Various reports can be generated from this data like the Stack Chart, but these are not guaranteed to be completely accurate, as the underlying data is sample-based.

### Markers in the profiler

Samples don't record every event that happens within the system, so some information gets lost. Markers on the other hand, get fired every time certain events happen within the system. These events can be arbitrarily added across Gecko by engineers wherever they may wish. This can be useful for exposing expensive operations that may be missed by the profiler, and the markers provide a precise view of how various systems are running.

### More Documentation on the Gecko Profiler:

- [nsIProfiler.idl](https://searchfox.org/firefox-main/source/tools/profiler/gecko/nsIProfiler.idl)
- [ProfileBufferEntry.h](https://searchfox.org/firefox-main/rev/5ccf4a7d77a329f237d3a41e400049f9c47dc71f/tools/profiler/core/ProfileBufferEntry.h#433-566)
- [Profile Data Format](./profile-data)

## Tracelogger (unused in the Firefox Profiler)

While the previous performance tools collect information about how Gecko runs as a whole, Tracelogger is specific to the SpiderMonkey engine. Tracelogger is not sample based, therefore it records every step that the SpiderMonkey engine performs to run a given chunk of JavaScript code. It's primarily used by JavaScript engineers, and includes a firehose of information often reaching into the several gigs of information. There is no current integration of this information with the Firefox Profiler.

- [Tracelogger on GitHub](https://github.com/h4writer/tracelogger)
