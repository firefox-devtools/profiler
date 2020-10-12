# Contributing to the Firefox Profiler

**NOTE**: In October 2020, due to the Outreachy contribution period, we moved our `good first issue` label to `outreachy onboarding` label. We did this to give priority to Outreachy applicants. If you are an Outreachy applicant, please look at this label instead. If you are not, we are sorry, but we don't offer any mentored starter issues this month since we have limited resources. If you still want to contribute, you can pick one of the [more challenging issues](https://github.com/firefox-devtools/profiler/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22+-label%3A%22outreachy+onboarding%22+-label%3Aassigned).

**This project doesn't take part in Hacktoberfest 2020**, because we focus on [Outreachy](https://www.outreachy.org/) during this month.

First off, thanks for taking the time to contribute to Mozilla and the Firefox Profiler! Beyond making the web a faster and smoother experience for Firefox users and the entire open web, we want to build a community of contributors around performance. This guide is an introduction to joining our community. We would love to have you. As a first step to contributing we encourage you to check out our [Code of Conduct](./CODE_OF_CONDUCT.md) to see how we're building an open and inclusive community.

## Who we are

This project is made up of a cross section of different parts of Mozilla, including people from Firefox DevTools and from Firefox's platform team who are working on the C++ and Rust internals of Firefox. Some core Mozillians on the team are:

| - | Name | Github Handle | Position |
| - | ---- | ------------- | -------- |
| ![][digitarald] | Harald Kirschner | [@digitarald](https://github.com/digitarald) | Firefox DevTools Product Manager |
| <img src="https://avatars.githubusercontent.com/mstange?size=56" width="56" height="56" /> | Markus Stange | [@mstange](https://github.com/mstange) | Firefox Platform Engineer |
| ![][gregtatum] | Greg Tatum | [@gregtatum](https://github.com/gregtatum) | Firefox Frontend Engineer |
| ![][julienw] | Julien Wajsberg | [@julienw](https://github.com/julienw) | Firefox Frontend Engineer |
| ![][brisad] | Michael Hoffmann | [@brisad](https://github.com/brisad) | Engineer and Contributor |
| ![][squelart] | Gérald Squelart | [@squelart](https://github.com/squelart) | Firefox Platform Engineer |
| ![][canova] | Nazim Can Altinova| [@canova](https://github.com/canova) | Firefox Platform and Frontend Engineer |

[digitarald]:https://avatars.githubusercontent.com/digitarald?size=56
[mstange]:https://avatars.githubusercontent.com/mstange?size=56
[gregtatum]:https://avatars.githubusercontent.com/gregtatum?size=56
[julienw]:https://avatars.githubusercontent.com/julienw?size=56
[brisad]:https://avatars.githubusercontent.com/brisad?size=56
[squelart]:https://avatars.githubusercontent.com/squelart?size=56
[canova]:https://avatars.githubusercontent.com/canova?size=56

We're friendly and we're on the [Mozilla Matrix instance](https://chat.mozilla.org/) in the [*Firefox Profiler* channel (*#profiler:mozilla.org*)](https://chat.mozilla.org/#/room/#profiler:mozilla.org). Come chat with us if you have any questions about the project.

## Getting started with development

[profiler.firefox.com](https://profiler.firefox.com) is a web application that loads in performance profiles for analysis. The profiles are loaded in from a variety of sources including directly imported from Firefox, online storage, and from local files.

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

 1. Run `git clone git@github.com:firefox-devtools/profiler.git`
 2. Run `cd profiler`
 3. Run `yarn install`, this will install all of the dependencies.
 4. Run `yarn start`, this will start up the webpack server.
 5. Point your browser to [http://localhost:4242](http://localhost:4242).
 6. If port `4242` is taken, then you can run the web app on a different port: `FX_PROFILER_PORT=1234 yarn start`

## Using Gitpod

Alternatively, you can also develop the Firefox Profiler online in a pre-configured development environment:

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/firefox-devtools/profiler)

Gitpod will automatically install all dependencies; start the webpack server for you; and open the web app in a new browser tab. Please look at our [gitpod documentation](./docs-user/gitpod.md) for more information.

## Loading in profiles for development

The web app doesn't include any performance profiles by default, so you'll need to load some in. Make sure the local Webpack web server is running, and then try one of the following:

 * Use an existing profile from the web: replace the `https://profiler.firefox.com` with `http://localhost:4242` (be careful: the leading `https` changes to `http`!).
 * Drag in a saved profile to the loading screen (this makes refreshing hard).
 * Record a new profile.
  1. Open `about:config` in Firefox.
  2. Change `devtools.performance.recording.ui-base-url` to `http://localhost:4242` or to the localhost with the proper port you have configured.
  3. Ensure the profiler menu button is active by clicking the button on the [profiler.firefox.com](https://profiler.firefox.com) homepage to enable it.
  4. Record a profile using the menu button, and it should open up in your local environment.

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

If you'd like to use [profiler.firefox.com](https://profiler.firefox.com) via URLs that are not `localhost` (e.g. live preview, proxy, other device...) you can expose the web application publicly like so:

```bash
FX_PROFILER_HOST="0.0.0.0" yarn start
```

You'll probably also want to add your non-localhost domains to the `allowedHosts` property in `server.js`.

## Finding something to work on

If this is your first time here, check out the label
[outreachy onboarding](https://github.com/firefox-devtools/profiler/issues?q=is%3Aopen+is%3Aissue+label%3A%22outreachy+onboarding%22+-label%3Aassigned).
We will mentor you through the process of completing a first bug, and these are
usually pretty good self-contained problems.

After leveling up on a few outreachy onboarding issues, we also have the
[help wanted](https://github.com/firefox-devtools/profiler/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22+-label%3A%22outreachy+onboarding%22+-label%3Aassigned)
tag for bugs that no one is actively working on, but are well-scoped and ready
to be tackled!

We know how stimulating working on our project can be, but
please refrain claiming several issues at once. Instead please decide on the one
issue you're interested in and leave a comment to let someone know. Take
especially care that no other contributor already asked for it. Then someone from
the team will answer and assign the issue to you. If you're commenting during
week-ends be aware that our team is working mostly on week days,
therefore please be patient :-)


Feel free to [chat with us on Matrix](https://chat.mozilla.org/#/room/#profiler:mozilla.org)
if you need help finding something you might be interested to work on or have any question.
You'll need to login first, and possibly click on the link again to access our
room directly.

You can also leave a message on our special [issue #1785](https://github.com/firefox-devtools/profiler/issues/1785).

## Submitting changes with a pull request (PR)

If you haven't sent in pull requests before, [here is GitHub's documentation](https://help.github.com/articles/creating-a-pull-request/) on how to do that. Generally it's a good idea to send in PRs early and often. It's better to get 5 minutes of feedback from an existing team member or contributor than spending an hour trying to fix something. Contributing is a collaborative process and we are friendly!

For PRs to be accepted, they go through a review process. Generally there is a feedback cycle where someone reviews and requests some changes. All PRs need to pass our tests. It is also good to send in new code with test coverage.

## Learning more

Make sure and check out the [docs](./docs-developer) for reading up on how this project works. In addition, most folders in the [`/src`](./src) directory contain a `README.md` explaining what the folder contains. Please file an issue if something is not clear and we'll write something up so the next person who comes along can figure things out easier, or even better submit a PR with your own docs!
