// @noflow
const path = require('path');
const projectRoot = path.join(__dirname, '../..');
const includes = [path.join(projectRoot, 'src')];

module.exports = {
  name: 'merge-android-profiles',
  target: 'node',
  mode: process.env.NODE_ENV,
  output: {
    path: path.resolve(projectRoot, 'dist'),
    filename: 'merge-android-profiles.js',
  },
  entry: './src/merge-android-profiles/index.js',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ['babel-loader'],
        include: includes,
      },
      {
        test: /\.svg$/,
        type: 'asset/resource',
      },
    ],
  },
  experiments: {
    // Make WebAssembly work just like in webpack v4
    syncWebAssembly: true,
  },
};
