# Testing - `/src/test/`

To run the tests make sure that the node_modules are installed with `yarn install` and then run `yarn test`. To test an individual file `yarn test src/test/file-name.js`.

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

## Code coverage

The aim of all new code is to have good test coverage. A handy way to do this is to run a code coverage report. This can be done by running `yarn test-coverage`. This will build the coverage report, and serve it locally. All new code can be manually scanned to see where there is no coverage. Alternately [codecov.io](https://codecov.io/gh/devtools-html/perf.html) provides a full coverage report for each PR, and the master branch.

## The tests

| Test type                  | Description |
| -------------------------- | ----------- |
| [components](./components) | Tests for React components, utilizing Enzyme for full behavioral testing, and snapshot tests to ensure that components output correct markup. |
| [store](./store)           | Testing the [Redux](http://redux.js.org/) store using actions and selectors. |
| [unit](./unit)             | Unit testing |
