# Firefox Profiler

[![Matrix][matrix-badge]][matrix]

The [Firefox Profiler] visualizes performance data recorded from web browsers. It is a tool designed to consume performance profiles from the Gecko Profiler but can visualize data from any profiler able to output in JSON. The interface is a web application built using [React] and [Redux] and runs entirely client-side.

[Mozilla] develops this tool to help make [Firefox] silky smooth and fast for millions of its users, and to help make sites and apps faster across the web.

![Screenshot of the Firefox Profiler](./docs-user/images/screenshot-2022-04-25.png?raw=true)

### Usage

> Visit [profiler.firefox.com](https://profiler.firefox.com/) :rocket:

This project is live on [https://profiler.firefox.com/](https://profiler.firefox.com/). The website includes instructions on how to get going to start recording and viewing performance profiles.

### Accessibility: Assistive technology support

The Profiler was tested with recent versions of the following assistive technology:

[NVDA](https://www.nvaccess.org/) (Windows) on Firefox and Chrome browsers </br>
[VoiceOver](https://www.apple.com/accessibility/mac/vision/) (Mac OS X) on Chrome</br>
[Orca](https://wiki.gnome.org/action/show/Projects/Orca?action=show&redirect=Orca) (Linux) on Firefox

If you experience problems using any of the above technologies, please file a bug.

If you would like to help us test on other assistive technologies or improve the existing code, we would love your contributions!

### Development

You will need a recent enough version of [Yarn 1 (Classic)](https://classic.yarnpkg.com/),
version 1.10 is known to work correctly.
You can install it using `npm install -g yarn`. Please refer to [its documentation](https://classic.yarnpkg.com/en/docs/install) for other possible install procedures.

To download and build the Firefox Profiler web app run:

```bash
git clone git@github.com:firefox-devtools/profiler.git
cd profiler
yarn install
yarn start
```

This project uses [TypeScript](https://www.typescriptlang.org/).

You can also develop the Firefox Profiler online in a pre-configured development environment using [GitHub Codespaces](https://github.com/features/codespaces).

Please look at our [GitHub Codespaces documentation](./docs-developer/codespaces.md) for more information.

For more detailed information on getting started contributing. We have plenty of docs available to get you started.

|                                                                   |                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [Contributing](./CONTRIBUTING.md)                                 | Find out in detail how to get started and get your local development environment configured.          |
| [Code of Conduct](./CODE_OF_CONDUCT.md)                           | We want to create an open and inclusive community, we have a few guidelines to help us out.           |
| [Developer Documentation](./docs-developer)                       | Want to know how this whole thing works? Get started here.                                            |
| [Source Files](./src)                                             | Dive into the inner workings of the code. Most folders have a `README.md` providing more information. |
| [End-User Documentation](https://profiler.firefox.com/docs/#/)    | These docs are customized for actual users of the profiler, not just folks contributing.              |
| [GitHub Codespaces documentation](./docs-developer/codespaces.md) | Start here if you want to set up a workspace on GitHub Codespaces.                                    |

### Discussion

Say hello on Matrix in the [_Firefox Profiler_ channel (_#profiler:mozilla.org_)][matrix].

### License

[MPL v2](./LICENSE) is designed to encourage contributors to share modifications they make to the code, while still allowing them to combine the code with code under other licenses (open or proprietary) with minimal restrictions.

We are very grateful to the **zlib compression library (Jean-loup Gailly, Mark Adler and team)** for their contribution to the project.

[matrix]: https://chat.mozilla.org/#/room/#profiler:mozilla.org

<!-- chat.mozilla.org's "real" server is mozilla.modular.im. -->

[matrix-badge]: https://img.shields.io/matrix/profiler:mozilla.org?server_fqdn=mozilla.modular.im&label=matrix
[Firefox Profiler]: https://profiler.firefox.com/
[React]: https://facebook.github.io/react/
[Redux]: http://redux.js.org/
[Mozilla]: https://www.mozilla.org/
[Firefox]: https://www.mozilla.org/firefox/
[zlib]: http://www.zlib.net/
