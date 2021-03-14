// @noflow
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OfflinePlugin = require('offline-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const includes = [path.join(__dirname, 'src'), path.join(__dirname, 'res')];

const es6modules = ['pretty-bytes'];
const es6modulePaths = es6modules.map(module => {
  return path.join(__dirname, 'node_modules', module);
});
const mode = 'development';
let target = 'web';
const config = {
  resolve: {
    alias: {
      // Note: the alias for firefox-profiler is defined at the Babel level, so
      // that Jest can profit from it too.
      'firefox-profiler-res': path.resolve(__dirname, 'res'),
    },
  },
  experiments: {
    syncWebAssembly: true,
  },
  devtool: 'source-map',
  mode: mode,
  module: {
    rules: [
      {
        test: /\.wasm$/,
        type: 'webassembly/sync',
      },
      {
        test: /\.js/,
        include: /@fluent[\\/]bundle[\\/]esm/,
        type: 'javascript/auto',
      },
      {
        test: /\.js/,
        include: /@fluent[\\/]langneg[\\/]esm/,
        type: 'javascript/auto',
      },
      {
        test: /\.js/,
        include: /@fluent[\\/]react[\\/]esm/,
        type: 'javascript/auto',
      },
      {
        test: /\.js/,
        include: /@fluent[\\/]sequence[\\/]esm/,
        type: 'javascript/auto',
      },

      // {
      //   test: /\.js/,
      //   include: /@react-localization[\\/]bundle[\\/]esm/,
      //   type: 'javascript/auto',
      // },
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,

        use: {
          loader: 'babel-loader',
        },
        include: includes.concat(es6modulePaths),
      },
      {
        test: /\.json$/,
        use: {
          loader: 'json-loader',
        },
        include: includes,
      },
      {
        test: /\.css?$/i,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            // This is required for asset imports in CSS, such as url()
            options: { publicPath: '' },
          },
          'css-loader',
          'postcss-loader',
        ],
        // loader: [
        //   'style-loader',
        //   { loader: 'css-loader', options: { importLoaders: 1 } },
        //   'postcss-loader',
        // ],
        include: [
          ...includes,
          path.join(__dirname, 'node_modules', 'photon-colors'),
          path.join(__dirname, 'node_modules', 'react-splitter-layout'),
        ],
      },
      {
        test: /\.jpg$/,
        loader: 'file-loader',
      },
      {
        test: /\.png$/,
        loader: 'file-loader',
      },
      {
        test: /\.svg$/,
        loader: 'file-loader',
      },
      {
        test: /\.ftl$/,
        loader: 'file-loader',
      },
    ],
  },
  // node: {
  //   process: false,
  // },
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
    new HtmlWebpackPlugin({
      title: 'Firefox Profiler',
      template: 'res/index.html',
      favicon: 'res/img/favicon.png',
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'res/_headers' },
        { from: 'res/_redirects' },
        { from: 'docs-user', to: 'docs' },
        { from: 'res/zee-worker.js' },
        { from: 'res/before-load.js' },
        { from: 'res/contribute.json' },
      ],
    }),
    new MiniCssExtractPlugin(),
  ],
  entry: ['./src/index'],
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[hash].bundle.js',
    chunkLoading: false,
    wasmLoading: false,
    chunkFilename: '[id].[fullhash].bundle.js',
    publicPath: '/',
  },
};

if (process.env.NODE_ENV === 'development') {
  config.mode = 'development';
  target = 'browserslist';
}

if (process.env.NODE_ENV === 'production') {
  target = 'browserlist';
  config.mode = 'production';
  config.plugins.push(
    new OfflinePlugin({
      relativePaths: false,
      AppCache: false,
      ServiceWorker: {
        scope: '/',
        events: true,
      },
      /* Exclude the files used but not served by netlify. When trying to fetch
       * them we get a 404, and so the SW registration fails. */
      excludes: ['_headers', '_redirects', 'docs/**', 'photon/**'],
      cacheMaps: [
        {
          requestTypes: ['navigate'],
          match: function(url, _request) {
            // This function is called for "navigate" requests to URLs within
            // our origin, whose URL does not match any files in the service
            // worker's list of assets. We can return a different URL which
            // will be looked up in the cache for this request.
            // There are two cases in which this happens:
            if (url.pathname === '/sw.js') {
              // 1. The service worker script itself is not in the list of
              // assets. Return null, which means "no override". The service
              // worker will fall back to getting this file from the network,
              // which is what we want to happen.
              // Doing this is not necessary for the service worker (and for
              // service worker updates) to work, but it makes debugging easier
              // because you can load the /sw.js URL from the address bar of
              // your browser and see the actual service worker script
              return null;
            }
            if (
              url.pathname.startsWith('/docs/') ||
              url.pathname === '/docs' ||
              url.pathname.startsWith('/photon/') ||
              url.pathname === '/photon'
            ) {
              // 2. We exclude the /docs from being cached, but we still want
              // the user to be able to access them.
              return null;
            }
            // 3. It's a URL like /from-addon/, or /public/.../?... .
            // For those URLs we want to respond with index.html, which is
            // cached as the "/" URL.
            return url.origin + '/';
          },
        },
      ],
    })
  );
}
module.exports = config;
