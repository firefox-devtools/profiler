# Setting up profiler on gitpod

Instead of configuring a local setup, you can also use [gitpod](https://www.gitpod.io/), an online continuous development environment with minimum setup.
Click the link below. An automatic workspace will be created.

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/firefox-devtools/profiler)

## Authorize with github

If you are using gitpod for the first time, you will have to authorize access to your GitHub account.This is necessary so you can access your data from within Gitpod.

To authorize access, click your avatar/profile picture at the top right hand section of the setup. A dropdown menu will be displayed. In the dropdown menu, click `Open Access Control`. It will open Access Control page from where you can check the checkboxes and click update.

## Open the profiler UI in your web browser

A popup box, `Open Ports View`, also appears at the bottom right hand section of the setup with the message `A service is available on port 4242`. You can click `Open Browser` which will open profiler UI, [profiler.firefox.com](https://profiler.firefox.com/), for your setup in a separate tab. If you have closed `Open Ports View`, you can display it by clicking `PORTS` at the right hand section of the bottom bar.

## Load custom profiles

If you want to load profiles for development, you can follow the steps described in [Loading in profiles for development](../CONTRIBUTING.md#loading-in-profiles-for-development) section.

## Advanced usage

As an alternative to following the link above, you can also login using your gitHub account and then follow the sets below.

- Change the URL of your browser to the respository, pull request or issue you want to open on gitpod e.g. for the [profiler project](https://github.com/firefox-devtools/profiler), URL of the upstream repository is `https://github.com/firefox-devtools/profiler`. You can also use the forked repository if you wish to start contributing to the project.
- Prefix the URL in the address bar of your browser with `gitpod.io/#` e.g. `https://github.com/firefox-devtools/profiler` becomes `https://gitpod.io/#https://github.com/firefox-devtools/profiler`.
- Gitpod will then launch a workspace for you and clone the repository, branch, commit or pull request depending on the URL in the first step.

## Using the gitpod browser extension (optional)

You can also install the [gitpod browser extension](https://addons.mozilla.org/en-GB/firefox/addon/gitpod/) if you wish instead of prefixing the URL of your browser with `gitpod.io/#` as described in the first step of **Advanced usage** section.

The browser extension, if you choose to install, will add a button on each repository on Github. Clicking the button will trigger creation of an automatic gitpod setup.
