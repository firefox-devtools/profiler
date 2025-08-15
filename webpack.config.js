const path = require('path');
const webpack = require('webpack');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { GenerateSW } = require('workbox-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const includes = [path.join(__dirname, 'src'), path.join(__dirname, 'res')];

const es6modules = ['pretty-bytes'];
const es6modulePaths = es6modules.map((module) => {
  return path.join(__dirname, 'node_modules', module);
});

// If L10N env variable is set, we read all the locale directories and use
// whatever we have there. This is done to make the l10n branch work with staging
// locales, so localizers can see the result of their translations immediately.
const availableStagingLocales = process.env.L10N
  ? JSON.stringify(fs.readdirSync('./locales'))
  : JSON.stringify(undefined);

const config = {
  output: {
    filename: '[name].[contenthash].bundle.js',
    publicPath: '/',
  },
  mode: process.env.NODE_ENV,
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    alias: {
      // Note: the alias for firefox-profiler is defined at the Babel level, so
      // that Jest can profit from it too.
      'firefox-profiler-res': path.resolve(__dirname, 'res'),
    },
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ['babel-loader'],
        include: includes.concat(es6modulePaths),
      },
      {
        test: /\.(ts|tsx)$/,
        use: ['babel-loader'],
        include: includes,
      },
      {
        test: /\.json$/,
        use: ['json-loader'],
        include: includes,
      },
      {
        test: /\.css?$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { importLoaders: 1 } },
          'postcss-loader',
        ],
        include: [
          ...includes,
          path.join(__dirname, 'node_modules', 'photon-colors'),
          path.join(__dirname, 'node_modules', 'react-splitter-layout'),
        ],
      },
      {
        test: /\.jpg$/,
        type: 'asset/resource',
      },
      {
        test: /\.png$/,
        type: 'asset/resource',
      },
      {
        test: /\.svg$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new CircularDependencyPlugin({
      // exclude node_modules
      exclude: /node_modules/,
      // add errors to webpack instead of warnings
      failOnError: true,
      // set the current working directory for displaying module paths
      cwd: process.cwd(),
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
    }),
    new webpack.DefinePlugin({
      AVAILABLE_STAGING_LOCALES: availableStagingLocales,
    }),
    new HtmlWebpackPlugin({
      title: 'Firefox Profiler',
      template: 'res/index.html',
      favicon: 'res/img/favicon.png',
    }),
    new CopyWebpackPlugin({
      patterns: [
        'res/_headers',
        'res/_redirects',
        'res/zee-worker.js',
        'res/contribute.json',
        'res/robots.txt',
        'res/service-worker-compat.js',
        { from: 'docs-user', to: 'docs' },
        { from: 'locales', to: 'locales' },
      ],
    }),
  ],
  experiments: {
    // Make WebAssembly work just like in webpack v4
    syncWebAssembly: true,
  },
};

if (config.mode === 'production') {
  // For an easier debugging with an unminified service worker, add this plugin
  // in development mode as well.
  config.plugins.push(
    new GenerateSW({
      // All navigation that's not in the cache will respond the entry for /index.html. ("SPA" mode)
      navigateFallback: '/index.html',
      // Cleanup the caches from old workbox installations. This isn't useful
      // for us _now_ but this can be later for future versions.
      cleanupOutdatedCaches: true,
      // Our biggest asset in production is currently 1.34MB. Therefore 2MB in
      // production looks sensible (this is the default too).
      // If it's not cached then index.html is answered instead because of
      // navigateFallback, then everything it's broken.
      // In development we want to use a higher limit so that we don't hit the
      // limit. This isn't normally used but can be used when debugging the
      // service worker.
      maximumFileSizeToCacheInBytes:
        config.mode === 'development' ? 10 * 1024 * 1024 : 2 * 1024 * 1024,
      // All scripts, including imported scripts, will be requested bypassing
      // HTTP cache, to determine if an update is needed, because we use
      // `updateViaCache: none` during the register. That's why we don't need to
      // use a hash or version in this file name.
      // For more information and background, see:
      // - discussion in https://github.com/w3c/ServiceWorker/issues/106
      // - chrome update in https://developer.chrome.com/blog/fresher-sw/
      // - step 8.21 in https://w3c.github.io/ServiceWorker/#update-algorithm
      importScripts: ['/service-worker-compat.js'],
      navigateFallbackDenylist: [
        // requests to docs and photon example pages shouldn't be redirected to
        // the index file as they're not part of the SPA
        /^\/docs(?:\/|$)/,
        /^\/photon(?:\/|$)/,
        // Allow navigating to source maps. This is not necessary, but it is
        // more developer friendly.
        /^\/[^/?]+\.map$/,
        // While excluding the service worker file isn't necessary to work, it's
        // convenient that we can just access it from a browser.
        /^\/sw\.js/,
      ],
      exclude: [
        // exclude user docs and photon from the cache
        'docs',
        'photon',
        // exclude also the netlify-specific files that aren't actually served
        // because this would fail the service worker installation
        '_headers',
        '_redirects',
        // do not cache source maps
        /\.map$/,
        // nor the service worker imported script
        'service-worker-compat.js',
      ],
      // This is the service worker file name. It should never change if we want
      // that the browser updates it. If this changes it will never be updated
      // and the user will be stuck with an old version.
      swDest: 'sw.js',
    })
  );
}

module.exports = config;
