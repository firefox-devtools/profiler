const path = require('path');
const webpack = require('webpack');
const projectRoot = path.join(__dirname, '../..');
const includes = [path.join(projectRoot, 'src')];

// Generate a unique build hash based on timestamp
const BUILD_HASH = Date.now().toString(36);

module.exports = {
  name: 'profile-query-cli',
  target: 'node',
  mode: process.env.NODE_ENV,
  stats: 'errors-only',
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'pq.js',
    chunkLoading: false,
    asyncChunks: false,
  },
  entry: './src/profile-query-cli/index.ts',
  module: {
    rules: [
      {
        test: /\.(js|ts|tsx)$/,
        use: ['babel-loader'],
        include: includes,
      },
    ],
  },
  plugins: [
    new webpack.BannerPlugin({
      banner:
        '#!/usr/bin/env node\n\n// Polyfill browser globals for Node.js\nglobalThis.self = globalThis;',
      raw: true,
    }),
    new webpack.DefinePlugin({
      __BUILD_HASH__: JSON.stringify(BUILD_HASH),
    }),
    // Ignore WASM demangle module for CLI build
    new webpack.IgnorePlugin({
      resourceRegExp: /^gecko-profiler-demangle$/,
    }),
    // Replace SVG imports with empty string since CLI doesn't need icons
    new webpack.NormalModuleReplacementPlugin(/\.svg$/, function (resource) {
      resource.request = 'data:text/javascript,export default ""';
    }),
  ],
  experiments: {
    // Make WebAssembly work just like in webpack v4
    syncWebAssembly: true,
  },
  optimization: {
    // Minify for npm distribution (reduces from 2.5MB to 640KB)
    minimize: true,
  },
};
