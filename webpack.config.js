const path = require('path');
const webpack = require('webpack');
const fs = require('fs');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const includes = [path.join(__dirname, 'src'), path.join(__dirname, 'res')];

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
    fallback: { zlib: false },
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.(js|ts|tsx)$/,
        use: ['babel-loader'],
        include: includes,
      },
      {
        test: /\.worker\.js$/,
        use: ['file-loader'],
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
          path.join(__dirname, 'node_modules', 'iongraph-web'),
          path.join(__dirname, 'node_modules', 'devtools-reps'),
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

module.exports = config;
