# Redux selectors - `/src/selectors`

This directory contains all of the [selectors](http://redux.js.org/docs/recipes/ComputingDerivedData.html) that are used to access state within this app. Reducers hold the canonical state representation. From there, these selectors take the current state and can compute derived data. Typically the functions that create complex derivations are stored somewhere else in the codebase (see examples in [`src/profile-logic`](../profile-logic)). These functions are then wired into the selectors. The selectors are memoized with the [https://github.com/reactjs/reselect](Reselect) library so that when the same arguments are passed in, the complicated data structure manipulation will not have to be re-run. This simplifies the use of these functions in the reactive programming world.

See the [`src/reducers`](../reducers)) for more information about how the reducers work.
