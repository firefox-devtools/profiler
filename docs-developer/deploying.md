# Deploying to profiler.firefox.com

Our hosting service is [Netlify](netlify.com).

## Deploy to production

The `production` branch is configured to be automatically deployed to
<https://profiler.firefox.com>.

In addition to this pushes to the `master` branch deploys to the domain
https://master--perf-html.netlify.app. Every pull request will be deployed as well to a
separate domain, whose link will be added automatically to the PR:
![The link to the preview deployment is in the sections where checks are](images/netlify-link.png)

## How to deploy master to production

The easiest by far is to
[create a pull request on GitHub](https://github.com/firefox-devtools/profiler/compare/production...master?expand=1).
It would be nice to write down the main changes in the PR description.

After the PR is created all checks should run. When it's ready the PR can be
merged. Be careful to always use the **create a merge commit** functionality,
not *squash* or *rebase*, to keep a better history.

Once it's done the new version should be deployed automatically. You can follow the
process on [Netlify's dashboard](https://app.netlify.com/sites/perf-html/deploys)
if you have access.

## How to revert to a previous version

In case the deployed version is bad we can revert to a previous version using
Netlify's dashboard.

[Search for the previous production build](https://app.netlify.com/sites/perf-html/deploys?filter=production)
and deploy it from its detail page.

When you're ready with a fix landed on `master`, you can push a new version to the
`production` branch as described in the first part.
