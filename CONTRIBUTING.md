# Contributing to the Firefox Profiler

First off, thanks for taking the time to contribute to Mozilla and the Firefox Profiler! Beyond making the web a faster and smoother experience for Firefox users and the entire open web, we want to build a community of contributors around performance. This guide is an introduction to joining our community. We would love to have you. As a first step to contributing we encourage you to check out our [Code of Conduct](./CODE_OF_CONDUCT.md) to see how we're building an open and inclusive community.

## Who we are

This project is made up of a cross section of different parts of Mozilla, including people from Firefox DevTools and from Firefox's platform team who are working on the C++ and Rust internals of Firefox. Some core Mozillians on the team are:

| -                                                                                          | Name               | Github Handle                                    | Position                               |
| ------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------ | -------------------------------------- |
| ![][fatadel]                                                                               | Adel Fatkhutdinov  | [@fatadel](https://github.com/fatadel)           | Firefox Frontend Engineer              |
| ![][carverdamien]                                                                          | Damien Carver      | [@carverdamien](https://github.com/carverdamien) | Firefox Platform Engineer              |
| ![][canova]                                                                                | Nazim Can Altinova | [@canova](https://github.com/canova)             | Firefox Platform and Frontend Engineer |
| <img src="https://avatars.githubusercontent.com/mstange?size=56" width="56" height="56" /> | Markus Stange      | [@mstange](https://github.com/mstange)           | Firefox Platform Engineer              |
| ![][davehunt]                                                                              | Dave Hunt          | [@davehunt](https://github.com/davehunt)         | Firefox Profiler Team Manager          |

<!-- mstange's image is differently inserted because its size isn't properly controlled by the size parameter, strangely -->

[mstange]: https://avatars.githubusercontent.com/mstange?size=56
[fatadel]: https://avatars.githubusercontent.com/fatadel?size=56
[carverdamien]: https://avatars.githubusercontent.com/carverdamien?size=56
[canova]: https://avatars.githubusercontent.com/canova?size=56
[davehunt]: https://avatars.githubusercontent.com/davehunt?size=56

We're friendly and we're on the [Mozilla Matrix instance](https://chat.mozilla.org/) in the [_Firefox Profiler_ channel (_#profiler:mozilla.org_)](https://chat.mozilla.org/#/room/#profiler:mozilla.org). Come chat with us if you have any questions about the project.

## Getting started with development

[profiler.firefox.com](https://profiler.firefox.com) is a web application that loads in performance profiles for analysis. The profiles are loaded in from a variety of sources including directly imported from Firefox, online storage, and from local files.

You will need a recent enough version of [Yarn 1 (Classic)](https://classic.yarnpkg.com/),
version 1.10 is known to work correctly.
You can install it using `npm install -g yarn`. Please refer to [its documentation](https://classic.yarnpkg.com/en/docs/install) for other possible install procedures.

To get started clone the repo and get the web application started.

1.  Run `git clone git@github.com:firefox-devtools/profiler.git`
2.  Run `cd profiler`
3.  Run `yarn install`, this will install all of the dependencies.
4.  Run `yarn start`, this will start up the webpack server.
5.  Point your browser to [http://localhost:4242](http://localhost:4242).
6.  If port `4242` is taken, then you can run the web app on a different port: `FX_PROFILER_PORT=1234 yarn start`

Other [webpack](https://webpack.js.org/configuration/) and [webpack server](https://webpack.js.org/configuration/dev-server/) options can be set in a `webpack.local-config.js` file at the repo root. For example, if you want to disable caching and the server to automatically open the home page, put in there the following code:

```js
module.exports = function (config, serverConfig) {
  config.cache = false;
  serverConfig.open = true;
};
```

This project uses [TypeScript](https://www.typescriptlang.org/).

## Using GitHub Codespaces

Alternatively, you can also develop the Firefox Profiler online in a pre-configured development environment using [GitHub Codespaces](https://github.com/features/codespaces).

GitHub Codespaces will automatically install all dependencies, start the webpack server for you, and forward port 4242 so you can access the web app. Please look at our [GitHub Codespaces documentation](./docs-developer/codespaces.md) for more information.

## Loading in profiles for development

The web app doesn't include any performance profiles by default, so you'll need to load some in. Make sure the local Webpack web server is running, and then try one of the following:

#### 1. Record a profile:

- Open `about:config` in Firefox.
- Change `devtools.performance.recording.ui-base-url` to `http://localhost:4242`. Or to the localhost with the proper port you have configured.
- Ensure the profiler menu button is active by clicking the button on your local profiler deployment homepage, usually http://localhost:4242, to enable it.
- Record a profile using the menu button, and it should open up in your local environment automatically.

#### 2. Use an existing profile:

- On the web, replace the https://profiler.firefox.com with your local server, usually `http://localhost:4242`. Be sure that that the protocol is `http` and not `https` when running the server locally.
- Alternatively, if a profile has been previously downloaded, drag and drop it to the loading screen. Compared to the previous solution, refreshing won't work with this particular solution.
- A third alternative on Linux is to run the provided [fp.sh](./bin/fp.sh) script, giving the profile file as the first argument. Both refreshing and symlinking to the script are supported.

For more information on loading a profile, visit its [documentation](./docs-developer/loading-in-profiles.md).

## Running the tests

When working on a new feature and code changes, it's important that things work correctly. We have a suite of automated tests and various automated checks to test that things are working the way we expect. These checks are run frequently, and will block certain parts of the process if they do not pass. The tests run:

- Locally when running
  - `yarn test-all` - Test all the things!
  - `yarn test` - Run the tests in [`./src/test/`](./src/test/).
  - `yarn lint` - Run prettier, stylelint, and eslint to check for correct code formatting.
  - `yarn ts` - Check for TypeScript type correctness.
  - `yarn license-check` - Check the dependencies' licenses.
- `git push` and `git commit`
  - We have [husky](https://www.npmjs.com/package/husky) installed to run automated checks when committing and pushing.
  - Run git commands with `--no-verify` to skip this step. This is useful for submitting broken PRs for feedback.
- Continuous integration for pull requests
  - We use GitHub Actions to run our tests for every PR that is submitted. This gives reviewers a great way to know if things are still working as expected.

### Updating snapshots

We have snapshot tests to ensure that components output the expected markup. If you change a `render` function, it will likely produce some snapshot failures when running `yarn test`. If the snapshot changes are what you expect, you can run `yarn test -u` to update the snapshots. Don't forget to include them in your commit as well.

## Exposing the web application publicly

If you'd like to use [profiler.firefox.com](https://profiler.firefox.com) via URLs that are not `localhost` (e.g. live preview, proxy, other device...) you can expose the web application publicly like so:

```bash
FX_PROFILER_HOST="0.0.0.0" yarn start
```

You'll probably also want to add your non-localhost domains to the `allowedHosts` property in `server.js`.

## Finding something to work on

If this is your first time here, check out the label
[good first issue](https://github.com/firefox-devtools/profiler/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22+-label%3Aassigned).
We will mentor you through the process of completing a first bug, and these are
usually pretty good self-contained problems.

After leveling up on a few good first issues, we also have the
[help wanted](https://github.com/firefox-devtools/profiler/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22+-label%3A%22good+first+issue%22+-label%3Aassigned)
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

## Updating locales

You can look at the [dedicated README file](./locales/README.md) in the locales directory.

## Submitting changes with a pull request (PR)

If you haven't sent in pull requests before, [here is GitHub's documentation](https://help.github.com/articles/creating-a-pull-request/) on how to do that. Generally it's a good idea to send in PRs early and often. It's better to get 5 minutes of feedback from an existing team member or contributor than spending an hour trying to fix something. Contributing is a collaborative process and we are friendly!

For PRs to be accepted, they go through a review process. Generally there is a feedback cycle where someone reviews and requests some changes. All PRs need to pass our tests. It is also good to send in new code with test coverage.

## Merging Pull Requests

Pull Requests should be merged with either option `Create a merge commit` or
`Squash and merge`, but **not** with `Rebase and merge`.

### Create a merge commit

This option keeps the pull request's full history, with all the authors information
and all individual commits. This is the best default choice, and the recommended
choice if the PR is composed of more than 1 commit and they're all well split up
in logical chunks.

When creating a merge commit, github will automatically use the pull request
title as the commit title, but please edit it where needed. It should look like
this:

> <Short description of what changes in this PR, can often be the PR title> (#XXX)

You can change the title if necessary. You can also add more information to
the commit message, and possibly add `Fixes #XXX`.

### Squash and merge

This option will put all commits in the pull request into one single commit,
and commit this single commit only to the main branch. We'll loose all author
information but one. This is recommended if the PR is composed of only one
commit, or several commits that aren't independent (which can be the case when
the contributor is new to the git system).

Similarly, when creating a squashed commit, github will automatically use the
pull request title as the commit title, but please edit it where needed. It
should look like this:

> <Short description of what changes in this PR, can often be the PR title> (#XXX)

Again you can edit the commit message if necessary, and possibly add `Fixes #XXX`.

## Learning more

Make sure and check out the [docs](./docs-developer) for reading up on how this project works. In addition, most folders in the [`/src`](./src) directory contain a `README.md` explaining what the folder contains. Please file an issue if something is not clear and we'll write something up so the next person who comes along can figure things out easier, or even better submit a PR with your own docs!
