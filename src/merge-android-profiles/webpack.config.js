const path = require('path');
const projectRoot = path.join(__dirname, '../..');
const includes = [path.join(projectRoot, 'src')];

module.exports = {
  name: 'merge-android-profiles',
  target: 'node',
  mode: process.env.NODE_ENV,
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    alias: {
      'firefox-profiler-res': path.resolve(projectRoot, 'res'),
    },
  },
  output: {
    path: path.resolve(projectRoot, 'dist'),
    filename: 'merge-android-profiles.js',
  },
  entry: './src/merge-android-profiles/index.ts',
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: ['babel-loader'],
        include: includes,
      },
      {
        test: /\.js$/,
        include: path.resolve(projectRoot, 'res'),
        type: 'asset/resource',
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
