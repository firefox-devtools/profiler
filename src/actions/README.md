# Redux action creators - `/src/actions/`

This folder contains all of the [Redux actions](http://redux.js.org/docs/basics/Actions.html) for the project. If this is your first time working with Redux, then taking a read through the [Redux docs](http://redux.js.org/) would probably be a good idea.

# Action type definitions

All actions in perf.html are fully typed using [Flow](https://flow.org/). These types are located in [`/src/types/actions.js`](../types/actions.js) and are built using a [union](https://flow.org/en/docs/types/unions/) of the action objects.

# Preferred practices for actions

Actions in perf.html are kept relatively simple. There are two types of action creators in this project–action creators that return an `Action` or an action creator that returns a `ThunkAction` (see [Redux Thunk](https://github.com/gaearon/redux-thunk) for additional reading.) If an action creator needs access to different parts of the state, then it may be tempting to use the `getState` parameter from a `ThunkAction`. However, at this time we prefer not to directly access the state in a `ThunkAction`. Instead, the connected component should look up the value using a selector, then pass it into the action creator as a parameter. 

### Don't access getState in ThunkAction creators

```js
export function doThunkAction() {
  return (dispatch, getState) => {
    // Don't do this!
    const requiredData = getState().requiredData;

    myAction(requiredData).then(() => {
      dispatch({ type: "ACTION_PERFORMED" })
    });
  };
}
```

### Instead pass in required data as an argument for ThunkAction creators

```js
export function doThunkAction(requiredData) {
  return dispatch => {
    myAction(requiredData).then(() => {
      dispatch({ type: "ACTION_PERFORMED" });
    });
  };
}
```

# Testing actions

For our approach for testing actions, please read the [store tests documentation](../test/store/README.md).
