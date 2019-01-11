# Contributing to perf.html

First off, thanks for taking the time to contribute to Mozilla and perf.html! Beyond making the web a faster and smoother experience for Firefox users and the entire open web, we want to build a community of contributors around performance. This guide is an introduction to joining our community. We would love to have you. As a first step to contributing we encourage you to check out our [Code of Conduct](./CODE_OF_CONDUCT.md) to see how we're building an open and inclusive community.

## Who we are

This project is made up of a cross section of different parts of Mozilla, including people from Firefox DevTools and from Firefox's platform team who are working on the C++ and Rust internals of Firefox. Some core Mozillians on the team are:

| - | Name | Github Handle | Position |
| - | ---- | ------------- | -------- |
| ![][digitarald] | Harald Kirschner | [@digitarald](https://github.com/digitarald) | Firefox DevTools Product Manager |
| <img src="https://avatars.githubusercontent.com/mstange?size=56" width="56" height="56" /> | Markus Stange | [@mstange](https://github.com/mstange) | Firefox Platform Engineer |
| ![][gregtatum] | Greg Tatum | [@gregtatum](https://github.com/gregtatum) | Firefox DevTools Engineer |
| ![][julienw] | Julien Wajsberg | [@julienw](https://github.com/julienw) | Firefox DevTools Engineer |
| ![][brisad] | Michael Hoffmann | [@brisad](https://github.com/brisad) | Engineer and Contributor |
| ![][zoepage] | Ola Gasidlo | [@zoepage](https://github.com/zoepage) | Firefox DevTools Engineer |
| ![][violasong] | Victoria Wang | [@violasong](https://github.com/violasong) | Firefox DevTools UX Designer |

[digitarald]:https://avatars.githubusercontent.com/digitarald?size=56
[mstange]:https://avatars.githubusercontent.com/mstange?size=56
[gregtatum]:https://avatars.githubusercontent.com/gregtatum?size=56
[julienw]:https://avatars.githubusercontent.com/julienw?size=56
[violasong]:https://avatars.githubusercontent.com/violasong?size=56
[brisad]:https://avatars.githubusercontent.com/brisad?size=56
[zoepage]:https://avatars.githubusercontent.com/zoepage?size=56

We're friendly and we're on the [Firefox DevTools Slack](https://devtools-html-slack.herokuapp.com/) in the #perf channel. Come chat with us if you have any questions about the project.

## Getting started with development

perf.html is a web application that loads in performance profiles for analysis. The profiles are loaded in from a variety of sources including from the [Gecko Profiler Addon](https://github.com/devtools-html/Gecko-Profiler-Addon), online storage, and from local files.

You will need a recent enough version of [Yarn](http://yarnpkg.com/),
version 1.0.1 is known to work correctly.
You can install it into your home directory on Linux and probably OS X with:

```bash
cd /tmp
wget https://yarnpkg.com/install.sh
chmod a+x install.sh
./install.sh
```

To get started clone the repo and get the web application started.

 1. Run `git clone git@github.com:devtools-html/perf.html.git`
 2. Run `cd perf.html`
 3. Run `yarn install`, this will install all of the dependencies.
 4. Run `yarn start`, this will start up the webpack server.
 5. Point your browser to [http://localhost:4242](http://localhost:4242).
 6. If port `4242` is taken, then you can run the web app on a different port: `PERFHTML_PORT=1234 yarn start`

## Loading in profiles for development

The web app doesn't include any performance profiles by default, so you'll need to load some in. Make sure the local Webpack web server is running perf.html, and then try one of the following:

 * Use an existing profile from the web: replace the `https://perf-html.io` with `http://localhost:4242` (be careful: the leading `https` changes to `http`!).
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
   - `yarn test-all` - Test all the things!
   - `yarn test` - Run the tests in [./src/test/].
   - `yarn lint` - Run prettier, stylelint, and eslint to check for correct code formatting.
   - `yarn flow` - Check the [Flow types](https://flow.org/) for correctness.
   - `yarn license-check` - Check the dependencies' licenses.
 * `git push` and `git commit`
   - We have [husky](https://www.npmjs.com/package/husky) installed to run automated checks when committing and pushing.
   - Run git commands with `--no-verify` to skip this step. This is useful for submitting broken PRs for feedback.
 * Continuous integration for pull requests
   - We use CircleCI to run our tests for every PR that is submitted. This gives reviewers a great way to know if things are still working as expected.

## Exposing the web application publicly

If you'd like to use perf.html via URLs that are not `localhost` (e.g. live preview, proxy, other device...) you can expose the web application publicly like so:

```bash
PERFHTML_HOST="0.0.0.0" yarn start
```

You'll probably also want to add you non-localhost domains to the `allowedHosts` in `server.js`.

## Finding something to work on

If this is your first time here, check out the label [Good First Issue](https://github.com/devtools-html/perf.html/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22). We will mentor you through the process of completing a first bug, and these are usually pretty good self-contained problems. After leveling up on a few good first issues, we also have the [Polish](https://github.com/devtools-html/perf.html/issues?q=is%3Aopen+is%3Aissue+label%3Apolish) tag for bugs that no one is actively working on, but are well-scoped and ready to be tackled!

Make sure and comment on the issue letting someone know you are interested in working on an issue. Feel free to [chat with us on slack](https://devtools-html-slack.herokuapp.com/) if you need help finding something you might be interested to work on.

## Submitting changes with a pull request (PR)

If you haven't sent in pull requests before, [here is GitHub's documentation](https://help.github.com/articles/creating-a-pull-request/) on how to do that. Generally it's a good idea to send in PRs early and often. It's better to get 5 minutes of feedback from an existing team member or contributor than spending an hour trying to fix something. Contributing is a collaborative process and we are friendly!

For PRs to be accepted, they go through a review process. Generally there is a feedback cycle where someone reviews and requests some changes. All PRs need to pass our tests. It is also good to send in new code with test coverage.

## Learning more

Make sure and check out the [docs](./docs-developer) for reading up on how this project works. In addition, most folders in the [`/src`](./src) directory contain a `README.md` explaining what the folder contains. Please file an issue if something is not clear and we'll write something up so the next person who comes along can figure things out easier, or even better submit a PR with your own docs!
