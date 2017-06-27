# perf.html

[![slack-badge]][slack]

[perf.html] visualizes performance data recorded from web browsers. It is a tool designed to consume performance profiles from the Gecko Profiler but can visualize data from any profiler able to output in JSON. The interface is a web application built using [React] and [Redux] and runs entirely client-side.

[Mozilla] develops this tool for examining the performance of [Firefox] as well as examining web page performance in the Firefox Developer Tools.

![](./screenshot.png?raw=true)

_This project was previously called [Cleopatra]._

### Usage

> Visit [perf-html.io](https://perf-html.io/) :rocket:

This project is live on [https://perf-html.io/](https://perf-html.io/). You need to install the add-on provided at that website to record profile data from Firefox.

### Development

> You'll find documentation for the project in the [docs folder](./docs).

We use [Yarn](http://yarnpkg.com/) as our dependency manager so you'll need to
go and install it before running the following commands.

```bash
git clone git@github.com:devtools-html/perf.html.git

cd perf.html
yarn install

yarn start
```

> To run a faster production version use `yarn start-prod` instead of `yarn start`

Assuming you've installed the add-on from [perf-html.io](https://perf-html.io/) you'll need to configure it to point to your local web development server.

 1. Go to `about:addons`
 2. Find the [Gecko Profiler add-on](https://cloud.githubusercontent.com/assets/2134/23817925/d02e5620-05ab-11e7-90dc-f28545d32dde.png)
 3. Click [Preferences button](https://cloud.githubusercontent.com/assets/2134/23817941/ea20d800-05ab-11e7-8e0f-aa4558fe2b1b.png)
 4. Change the value of the [Reporter URL](https://cloud.githubusercontent.com/assets/2134/23817954/00ad2ba0-05ac-11e7-8814-1dda83a45d43.png) to `http://localhost:4242/from-addon/`

**add-on**

If you'd like to develop the add-on perf.html uses see the [Gecko Profiler] repository.

### Discussion

Say hello on [slack] in the #perf channel.

### License

[MPL v2](./LICENSE)

### Optional Notices

Some permissive software licenses request but do not require an acknowledgement of the use of their software. We are very grateful to the following people and projects for their contributions to this product:

* The [zlib] compression library (Jean-loup Gailly, Mark Adler and team)

[slack-badge]: https://devtools-html-slack.herokuapp.com/badge.svg
[slack]: https://devtools-html-slack.herokuapp.com/

[perf.html]:https://perf-html.io/
[React]:https://facebook.github.io/react/
[Redux]:http://redux.js.org/
[Mozilla]:https://www.mozilla.org/
[Firefox]:https://www.mozilla.org/firefox/
[Cleopatra]: https://github.com/mozilla/cleopatra
[Gecko Profiler]: https://github.com/devtools-html/Gecko-Profiler-Addon
[zlib]: http://www.zlib.net/
