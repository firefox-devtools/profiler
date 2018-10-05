### Development

To build perf.html (for Windows users):

You will need a recent enough version of [Yarn](http://yarnpkg.com/),
version 1.0.1 is known to work correctly. 
If you have Node.js installed, you can use npm to install it.

```bash
npm install yarn -g
```
To download and build perf.html run:

```bash
git clone git@github.com:devtools-html/perf.html.git
cd perf.html
yarn install
```

In perf.html/webpack.config.js:

```bash
new CopyWebpackPlugin([
      { from: 'res/_headers' },
      { from: 'res/_redirects' },
      { from: 'docs-user', to: 'docs' },
```
add 

```bash
{ from: 'res/.htaccess' },
{ from: 'res/zee-worker.js' },
{ from: 'res/analytics.js' },
```
and remove them from perf.html/package.json

"build:clean": "rimraf dist && mkdirp dist && cp res/.htaccess res/zee-worker.js res/analytics.js dist/"

now run:

```bash
yarn add --dev cross-env
```

and replace env with cross-env in perf.html/package.json.

Now run:

```bash
yarn start
```
and point your browser to http://localhost:4242
 