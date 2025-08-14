# Manipulating and processing profiles - `/src/profile-logic`

This folder is a catch-all for profile manipulating and processing operations. The [Redux](http://redux.js.org/) store, reducers, and selectors are not the proper place to do complicated work manipulating data structures, especially something as complicated as a performance profile. The functions in this folder operate completely independently from [Redux](http://redux.js.org/) and [React](https://facebook.github.io/react/) components. Typically they are wired into various selectors and different places within the overall app to perform the various pieces of work, or to compute derivative data structures.

For instance the [`marker-timing.ts`](./marker-timing.ts) file takes the list of markers from the processed profile, and computes timing information for laying them out easily in the Marker Chart. This is a derived view on the data that is then hooked up into a selector, so that the computation gets memoized and cached whenever it is used throughout the application. The marker timing functions can therefore be pure functions that return a new derived data structure. This architecture makes for functions that are easy to test, document, and that work consistently and quickly in the application.

## Profile processing

The profile processing functions live here, and are documented in [Upgrading Profiles](../../docs-developer/upgrading-profiles.md) in the [`/docs-developer`](../../docs-developer) folder.
