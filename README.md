# perf.html

[![slack-badge]][slack]

[perf.html] visualizes performance data recorded from web browsers. It is a tool designed to consume performance profiles from the Gecko Profiler but can visualize data from any profiler able to output in JSON. The interface is a web application built using [React] and [Redux] and runs entirely client-side.

[Mozilla] develops this tool to help make [Firefox] silky smooth and fast for millions of its users, and to help make sites and apps faster across the web.

![](./screenshot.png?raw=true)

_This project was previously called [Cleopatra]._

### Usage

> Visit [perf-html.io](https://perf-html.io/) :rocket:

This project is live on [https://perf-html.io/](https://perf-html.io/). The website includes instructions on how to get going to start recording and viewing performance profiles.

### Development

You will need a recent enough version of [Yarn](http://yarnpkg.com/),
version 1.0.1 is known to work correctly.
You can install it into your home directory on Linux and probably OS X with:

```bash
cd /tmp
wget https://yarnpkg.com/install.sh
chmod a+x install.sh
./install.sh
```

To download and build perf.html run:

```bash
git clone git@github.com:devtools-html/perf.html.git
cd perf.html
yarn install
yarn start
```

For more detailed information on getting started contributing. We have plenty of docs available to get you started.

| | |
| ---- | --- |
|[Contributing](./CONTRIBUTING.md)| Find out in detail how to get started and get your local development environment configured. |
|[Code of Conduct](./CODE_OF_CONDUCT.md)| We want to create an open and inclusive community, we have a few guidelines to help us out. |
|[Developer Documentation](./docs-developer)| Want to know how this whole thing works? Get started here. |
|[Roadmap](./ROADMAP.md)| Get more information about why we are building this tool, and what we have planned. |
|[Source Files](./src)| Dive into the inner workings of the code. Most folders have a `README.md` providing more information.
|[Gecko Profiler Addon][Gecko Profiler]| perf.html can record profiles directly in the browser using an add-on, development takes place in another repo. |

### Discussion

Say hello on [slack] in the #perf channel.

### License

[MPL v2](./LICENSE)

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
