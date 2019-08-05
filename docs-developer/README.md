# Firefox Profiler development docs

[profiler.firefox.com](https://profiler.firefox.com) is a client for reading profiles from the profiler component built inside of Firefox, known as the Gecko Profiler. It also can read in formats from [a variety of sources](./loading-in-profiles.md). The front-end client is written using JavaScript and [Flow types](https://flow.org/) using [React](https://facebook.github.io/react/) for the UI components and [Redux](http://redux.js.org/) for the state management. This client interacts with Firefox using the [Gecko Profiler add-on](https://raw.githubusercontent.com/firefox-devtools/Gecko-Profiler-Addon/master/gecko_profiler.xpi). This add-on is the glue between [profiler.firefox.com](https://profiler.firefox.com), and the internal profiler interface in Gecko.

## The Docs

 * [Firefox Profiler src docs](../src)
   - [Redux action creators - `/src/actions`](../src/actions)
   - [React components - `/src/components`](../src/components)
   - [Manipulating and processing profiles - `/src/profile-logic`](../src/profile-logic)
   - [Redux reducers - `/src/reducers`](../src/reducers)
   - [Redux selectors- `/src/selectors`](../src/selectors)
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
 * [Writing a Custom Profile Importer](./custom-importer.md)
 * [Markers](./markers.md)
 * [Upgrading profiles](./upgrading-profiles.md)
 * [Potential performance data sources in Gecko](./data-sources.md)
 * [Call tree](./call-tree.md)
 * [Frames, funcs, stacks and CallNodes in C++](./call-nodes-in-cpp.md)
 * [Deploying to production](./deploying.md)
 * [Symbolication](./symbolication.md)
