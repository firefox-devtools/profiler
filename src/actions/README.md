# Redux action creators - `/src/actions/`

This folder contains all of the [Redux actions](http://redux.js.org/docs/basics/Actions.html) for the project. If this is your first time working with Redux, then taking a read through the [Redux docs](http://redux.js.org/) would probably be a good idea.

# Action type definitions

All actions in the Firefox Profiler are fully typed. These types are located in [`/src/types/actions.ts`](../types/actions.ts).

# Preferred practices for actions

Actions in the profiler are kept relatively simple. There are two types of action creators in this project–action creators that return an `Action` or an action creator that returns a `ThunkAction` (see [Redux Thunk](https://github.com/gaearon/redux-thunk) for additional reading.) If an action creator needs access to different parts of the state, we strongly recommend you use the `getState` parameter from a `ThunkAction`. If you need an alternative method to directly access the state in a `ThunkAction`, you can look up the value using a selector within the connected component. You can then pass it into the action creator as a parameter.

### Accessing getState in ThunkAction creators.

```js
export function doThunkAction() {
  return (dispatch, getState) => {
    // We strongly recommend this method.
    const requiredData = getState().requiredData;

    myAction(requiredData).then(() => {
      dispatch({ type: 'ACTION_PERFORMED' });
    });
  };
}
```

### Alternatively, you can pass in required data as an argument for ThunkAction creators.

```js
export function doThunkAction(requiredData) {
  return (dispatch) => {
    myAction(requiredData).then(() => {
      dispatch({ type: 'ACTION_PERFORMED' });
    });
  };
}
```

# Testing actions

For our approach for testing actions, please read the [store tests documentation](../test/store/README.md).
