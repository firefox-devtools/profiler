# React component testing

## Snapshot tests

Snapshots provide an easy way to show how React components are rendered. Any time a component is updated, its snapshot needs to be regenerated. This can be done by running `yarn test -u`. The updated snapshot should be manually inspected by both the author and code reviewer to ensure that the changes that were made are intentional and correct. Care should be taken when writing snapshot tests, as they fail quite easily, and only show that *something* has changed. Generally one snapshot test for a component is pretty good, while the larger component behavior should be asserted using more specific Enzyme tests.

## Enzyme

[Enzyme](https://github.com/airbnb/enzyme) tests are good for asserting specific behavior of components. They should be used for things like testing event handlers, and specific behavior of components. Originally this project used [react-test-renderer](https://www.npmjs.com/package/react-test-renderer), but Enzyme proved more useful for triggering events and manipulating the component as a user would with a mouse and keyboard.

The biggest danger with Enzyme tests is that they can be slow. Care should be taken with tests to ensure that only the necessary components should be rendered for a test. The best way to do this is to use the [shallow](https://github.com/airbnb/enzyme/blob/master/docs/api/shallow.md) render functionality. However, sometimes it is necessary to test all of the components rendered. This can be done with the [mount](https://github.com/airbnb/enzyme/blob/master/docs/api/mount.md) function.
