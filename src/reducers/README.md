# Redux reducers and selectors - `/src/reducers`

This directory contains all of the [reducers](http://redux.js.org/docs/basics/Reducers.html) that are used to store state within this app. Reducers all accept some part of the store's state, and an action that is passed through a switch. This action is [Flow](https://flow.org/) typed as a [union](https://flow.org/en/docs/types/unions/) of all action objects, but [Flow](https://flow.org/) can understand the switch statements and will correctly infer which action is being used inside of the reducers. State is assumed to be immutable so that strict equality checks can tell when new bits of state are different.

# Selectors

See [`src/selectors`](../selectors)) for how this state is accessed.

# Flow typing

The state is fully [Flow](https://flow.org/) typed and the definitions live in the [`src/types/reducers.js`](../types/reducers.js) file.
