# Testing in perf.html

To run the tests make sure that the node_modules are installed with `yarn install` and then run `yarn test`. To test an individual file `yarn test-all src/test/file-name.js`.

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

Right now there are [Redux store tests](./store) and [unit tests](./unit). React component tests are planned as well as eventually supporting full integration tests.
