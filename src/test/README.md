# Testing in perf.html

To run the tests make sure that the node_modules are installed with `npm install` and then run `npm test`. To test an individual file `npm run test-all src/test/file-name.js`.

Tests are run with [Jest](https://facebook.github.io/jest/) and use a behavior-driven testing style, with plain language descriptions.

```javascript
describe('the thing to be tested', function() {
  it('does some piece of work', function() {
    expect( ... ).toEqual(...);
  })
})
```

Assertions are written using [Jest's own Library](https://facebook.github.io/jest/docs/using-matchers.html#content).
We use `async`/`await` to test asynchronous code. We also sometimes use [sinon's mock library](http://sinonjs.org/)
when Jest's mocking capabilities are falling short. This should be used as a last resort only because better solutions usually exist.

## The tests

| Test type                  | Description |
| -------------------------- | ----------- |
| [components](./components) | Snapshot tests for [React](https://facebook.github.io/react/) components (experimental). Full component testing is planned as well. |
| [store](./store)           | Testing the [Redux](http://redux.js.org/) store using actions and selectors. |
| [unit](./unit)             | Unit testing |
