# Contributing to perf.html

First off, thanks for taking the time to contribute to Mozilla and perf.html! Beyond making the web a faster and smoother experience for Firefox users and the entire open web, we want to build a community of contributors around performance. This guide is an introduction to joining our community. We would love to have you. As a first step to contributing we encourage you to check our our [Code of Conduct](./CODE_OF_CONDUCT.md) to see how we're building an open and inclusive community.

## Who we are

This project is made up of a cross section of different parts of Mozilla, including people from Firefox DevTools and from Firefox's platform team who are working on the C++ and Rust internals of Firefox. Some core Mozillians on the team are.

 * Bryan Clark [@clarkbw](https://github.com/clarkbw) - Firefox DevTools Product Manager
 * Markus Stange [@mstange](https://github.com/mstange) - Firefox Platform Engineer
 * Greg Tatum [@gregtatum](https://github.com/gregtatum) - Firefox DevTools Engineer
 * Julien Wajsberg [@julienw](https://github.com/julienw) - Firefox DevTools Engineer

We're friendly and we're on the [Firefox DevTools Slack](https://devtools-html-slack.herokuapp.com/) in the #perf channel. Come chat with us if you have any questions about the project.

## Getting started with development

perf.html is a web application that loads in performance profiles for analysis. The profiles are loaded in from a variety of sources including from the [Gecko Profiler Addon](https://github.com/devtools-html/Gecko-Profiler-Addon), online storage, and from local files. To get started clone the repo and get the web application started.

 1. Install [Yarn](http://yarnpkg.com/), we use this for our dependency management.
 2. Run `git clone git@github.com:devtools-html/perf.html.git`
 3. Run `cd perf.html`
 4. Run `yarn install`, this will install all of the dependencies.
 5. Run `yarn start`, this will start up the webpack server.
 6. Point your browser to [http://localhost:4242](http://localhost:4242).
 7. If port `4242` is taken, then you can run the web app on a different port: `PERFHTML_PORT=1234 yarn start`

## Loading in profiles for development

The web app doesn't include any performance profiles by default, so you'll need to load some in. Make sure the local Webpack web server is running perf.html, and then try one of the following:

 * Use an existing profile from the web: replace the `https://perf-html.io` with `http://localhost:4242`.
 * Drag in a saved profile to the loading screen (this makes refreshing hard).
 * Record a new profile.
   - Install the Gecko Profiler addon from the [perf-html.io](https://perf-html.io) loading screen.
   - Go to `about:addons` in your URL bar.
   - Click [Preferences button](https://cloud.githubusercontent.com/assets/2134/23817941/ea20d800-05ab-11e7-8e0f-aa4558fe2b1b.png) next to the Gecko Profiler addon.
   - Change the [Profile viewer URL](https://user-images.githubusercontent.com/167767/27658883-70068388-5c06-11e7-831e-14ed1438e9a3.png) from `https://perf-html.io` to `http://localhost:4242`.
   - Record a profile following the directions on the perf.html loading screen, and the profile should open in the local development version.

## Running the tests

When working on a new feature and code changes, it's important that things work correctly. We have a suite of automated tests and various automated checks to test that things are working the way we expect. These checks are run frequently, and will block certain parts of the process if they do not pass. The tests run:

 * Locally when running
   - `yarn run test-all` - Test all the things!
   - `yarn run test` - Run the tests in [./src/test/].
   - `yarn run lint` - Run prettier and and eslint to check for correct code formatting.
   - `yarn run flow` - Check the [Flow types](https://flow.org/) for correctness.
   - `yarn run license-check` - Check the dependencies' licenses.
 * `git prepush` and `git commit`
   - We have [husky](https://www.npmjs.com/package/husky) installed to run automated checks when committing and pushing.
   - Run git commands with `--no-verify` to skip this step. This is useful for submitting broken PRs for feedback.
 * Continuous integration for pull requests
   - We use CircleCI to run our tests for every PR that is submitted. This gives reviewers a great way to know if things are still working as expected.

## Finding something to work on

If this is your first time here, check out the label [Good First Bug](https://github.com/devtools-html/perf.html/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+bug%22). We will mentor you through the process of completing a first bug, and these are usually pretty good self-contained problems. After leveling up on a few good first bugs, we also have the [Available](https://github.com/devtools-html/perf.html/issues?utf8=%E2%9C%93&q=is%3Aopen%20is%3Aissue%20label%3Aavailable%20) tag for bugs that no one is actively working on, but are well-scoped and ready to be tackled!

Make sure and comment on the issue letting someone know you are interested in working on an issue. Feel free to [chat with us on slack](https://devtools-html-slack.herokuapp.com/) if you need help finding something you might be interested to work on.

## Submitting changes with a pull request (PR)

If you haven't sent in pull requests before, [here is GitHub's documentation](https://help.github.com/articles/creating-a-pull-request/) on how to do that. Generally it's a good idea to send in PRs early and often. It's better to get 5 minutes of feedback from an existing team member or contributor than spending an hour trying to fix something. Contributing is a collaborative process and we are friendly!

For PRs to be accepted, they go through a review process. Generally there is a feedback cycle where someone reviews and requests some changes. All PRs need to pass our tests. It is also good to send in new code with test coverage.

## Learning more

Make sure and check out the [docs](./docs) for reading up on how this project works. In addition, most folders in the [`/src`](./src) directory contain a `README.md` explaining what the folder contains. Please file an issue if something is not clear and we'll write something up so the next person who comes along can figure things out easier, or even better submit a PR with your own docs!
