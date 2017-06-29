# Redux reducers and selectors - `/src/reducers`

This directory contains all of the [reducers](http://redux.js.org/docs/basics/Reducers.html) and [selectors](http://redux.js.org/docs/recipes/ComputingDerivedData.html) that are used to store state within this app. The reducers and selectors are co-located in the same file for the ergonomics of how closely the data is associated. Reducers all accept some part of the store's state, and an action that is passed through a switch. This action is [Flow](https://flow.org/) typed as a [union](https://flow.org/en/docs/types/unions/) of all action objects, but [Flow](https://flow.org/) can understand the switch statements and will correctly infer which action is being used inside of the reducers. State is assumed to be immutable so that strict equality checks can tell when new bits of state are different.

# Selectors

Reducers only hold the canonical state representation. From there, the selectors take the current state and can compute derived data. Typically the functions that create complex derivations are stored somewhere else in the codebase (see examples in [`src/profile-logic`](../profile-logic)). These functions are then wired into the selectors. The selectors are memoized with the [https://github.com/reactjs/reselect](Reselect) library so that when the same arguments are passed in, the complicated data structure manipulation will not have to be re-run. This simplifies the use of these functions in the reactive programming world.

# Flow typing

The state is fully [Flow](https://flow.org/) typed and the definitions live in the [`src/types/reducers.js`](../types/reducers.js) file.
