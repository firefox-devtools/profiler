# perf.html development docs

This project is a client for reading profiles from the Gecko Profiler and potentially other sources in the future. It is written using JavaScript and [Flow types](https://flow.org/) using [React](https://facebook.github.io/react/) for the UI components and [Redux](http://redux.js.org/) for the state management. The perf.html client interacts with Firefox using the [Gecko Profiler add-on](https://raw.githubusercontent.com/devtools-html/Gecko-Profiler-Addon/master/gecko_profiler.xpi). This add-on is the glue between the HTML client of perf.html, and the internal profiler interface in Gecko.

## The Docs

 * [perf.html src docs](../src)
   - [Redux action creators - `/src/actions`](../src/actions)
   - [React components - `/src/components`](../src/components)
   - [Manipulating and processing profiles - `/src/profile-logic`](../src/profile-logic)
   - [Redux reducers and selectors - `/src/reducers`](../src/reducers)
   - [Testing - `/src/test`](../src/test)
     - [React component testing](../src/test/components)
     - [Redux store testing](../src/test/store)
     - [Unit testing](../src/test/unit)
   - [Flow types - `/src/types`](../src/types)
   - [Utility files - `/src/utils`](../src/utils)
 * [Profiler architecture](./architecture.md)
 * [Loading in profiles from various sources](./loading-in-profiles.md)
 * [Gecko profile format](./gecko-profile-format.md)
 * [Processed profile format](./processed-profile-format.md)
 * [Markers](./markers.md)
 * [Upgrading profiles](./upgrading-profiles.md)
 * [Potential performance data sources in Gecko](./data-sources.md)
 * [Call tree](./call-tree.md)
 * [Frames, funcs, stacks and CallNodes in C++](./call-nodes-in-cpp.md)
 * [Deploying perf.html](./deploying.md)
