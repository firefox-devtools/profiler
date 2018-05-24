const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const OfflinePlugin = require('offline-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const includes = [path.join(__dirname, 'src'), path.join(__dirname, 'res')];

const es6modules = ['pretty-bytes'];
const es6modulePaths = es6modules.map(module => {
  return path.join(__dirname, 'node_modules', module);
});

const config = {
  resolve: {
    alias: {
      'redux-devtools/lib': path.join(__dirname, '..', '..', 'src'),
      'redux-devtools': path.join(__dirname, '..', '..', 'src'),
      react: path.join(__dirname, 'node_modules', 'react'),
    },
    extensions: ['.js'],
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        loaders: ['babel-loader'],
        include: includes.concat(es6modulePaths),
      },
      {
        test: /\.json$/,
        loaders: ['json-loader'],
        include: includes,
      },
      {
        test: /\.css?$/,
        loaders: ['style-loader', 'css-loader?minimize'],
        include: includes.concat(
          path.join(__dirname, 'node_modules', 'photon-colors')
        ),
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
    ],
  },
  node: {
    process: false,
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
    }),
    new HtmlWebpackPlugin({
      title: 'perf.html',
      template: 'res/index.html',
      favicon: 'res/img/favicon.png',
    }),
    new CopyWebpackPlugin([
      { from: 'res/_headers' },
      { from: 'res/_redirects' },
      { from: 'docs-user', to: 'docs' },
    ]),
  ],
  entry: ['./src/index'],
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[hash].bundle.js',
    chunkFilename: '[id].[hash].bundle.js',
    publicPath: '/',
  },
};

if (process.env.NODE_ENV === 'development') {
  config.devtool = 'source-map';
  config.entry = ['webpack-dev-server/client?http://localhost:4242'].concat(
    config.entry
  );
}

if (process.env.NODE_ENV === 'production') {
  config.plugins.push(
    new webpack.optimize.ModuleConcatenationPlugin(),
    new UglifyJsPlugin({
      sourceMap: true,
      parallel: true,
      cache: true,
      uglifyOptions: process.env.UGLIFY_OPTIONS
        ? JSON.parse(process.env.UGLIFY_OPTIONS)
        : undefined,
    }),
    new OfflinePlugin({
      relativePaths: false,
      AppCache: false,
      ServiceWorker: {
        scope: '/',
        events: true,
      },
      externals: ['/zee-worker.js', '/analytics.js'],
      /* Exclude the files used but not served by netlify. When trying to fetch
       * them we get a 404, and so the SW registration fails. */
      excludes: ['_headers', '_redirects'],
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
            // 2. It's a URL like /from-addon/, or /public/.../?... .
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
