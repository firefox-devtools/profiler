const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const OfflinePlugin = require('offline-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
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
    new webpack.optimize.ModuleConcatenationPlugin(),
    new HtmlWebpackPlugin({
      title: 'perf.html',
      template: 'res/index.html',
      favicon: 'res/favicon.png',
    }),
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
    new UglifyJsPlugin({
      sourceMap: true,
      parallel: true,
      cache: true,
    }),
    new OfflinePlugin({
      relativePaths: false,
      AppCache: false,
      ServiceWorker: {
        scope: '/',
        events: true,
      },
      externals: ['/zee-worker.js', '/worker.js', '/analytics.js'],
      cacheMaps: [
        {
          requestTypes: null,
          match: function(url, _request) {
            return url.origin === location.origin ? url.origin + '/' : null;
          },
        },
      ],
    })
  );
}

module.exports = config;
