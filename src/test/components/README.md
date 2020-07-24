# React component testing

## Snapshot tests

Snapshots provide an easy way to show how React components are rendered. Any
time a component is updated, its snapshot needs to be regenerated. This can be
done by running `yarn test -u`.

The updated snapshot should be manually inspected by both the author and code
reviewer to ensure that the changes that were made are intentional and correct.

Care should be taken when writing snapshot tests, as they fail quite easily, and
only show that *something* has changed. Generally one snapshot test for a
component is pretty good, while the larger component behavior should be asserted
using more specific expectations.

## react-testing-library

We use [React Testing Library](https://github.com/testing-library/react-testing-library)
to tests our React components. Generally we try to test our components by
exercising them just like a user would do: finding a control by text using [the
queries provided by the library](https://testing-library.com/docs/api-queries)
and [fire events](https://testing-library.com/docs/api-events) to these targets.

In other cases, especially connected components that react to state changes
produced by other components, we dispatch Redux actions and test our
expectation afterwards.

## A few guidelines

Most of our tests use a `setup` function. Its role is to setup the environment
(create a proper profile, dispatch actions to get a good state, render a
component), and define higher-level functions to manipulate the component. Then
the returned object contains these functions along with useful values that tests
can make use of.

Here is a full example:
```js
describe('app/Details', function() {
  function setup() {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  E
    `);

    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <Details />
      </Provider>
    );

    const { getByText } = renderResult;

    function interactWithComponent() {
      fireEvent.click(getByText(/Click me/));
    }

    return { ...renderResult, store, interactWithComponent };
  }

  it('reacts when interacted', () => {
    const { container, interactWithComponent } = setup();
    interactWithComponent();
    expect(container.firstChild).toMatchSnapshot();
  });
});
```

## Solutions to common problems

React Testing Library relies a lot on the underlying DOM library.
In our case we use [jsdom](https://github.com/jsdom/jsdom) which is excellent
but has a few shortcomings.

### `MouseEvent` lacks some properties
The event object `MouseEvent` lacks some properties that we use, namely `offsetX`,
`offsetY`, `pageX`, `pageY`. We have a utility called `getMouseEvent` that we
can use in this case:
```js
import { getMouseEvent } from '../fixtures/utils';
...

// By using `fireEvent` directly and not one of its methods, we get to pass
// a full Event object.
fireEvent(target, getMouseEvent({ pageX: 5 }));
```

### Canvas doesn't have a Context API
A lot of our components use the Canvas Context API to draw graphs and display
data. To test this properly we developed a mock that can be used in this way:
```js
import mockCanvasContext from '../fixtures/mocks/canvas-context';
...

function setup() {
  const ctx = mockCanvasContext();
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx);

  return { flushDrawLogs: ctx.__flushDrawLogs };
}

it('draws the right things to the screen', () => {
  const { flushDrawLogs } = setup();
  expect(flushDrawLogs()).toMatchSnapshot();
});
```

### A quick way to know the render output

The `render` calls return a useful utility `debug` that can be called in tests,
that will output the result of the render to the console. This is extremely
useful to better know how to target elements. This utility is also returned by
all `setup` functions, so it's very easy to use it when needed:
```js
it('renders a lot of things', () => {
  const { container, debug } = setup()
  debug();
  ...
});
```
