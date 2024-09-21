// @noflow
const path = require('path');
const projectRoot = path.join(__dirname, '../..');
const includes = [path.join(projectRoot, 'src')];

module.exports = {
  name: 'symbolicator-cli',
  target: 'node',
  mode: process.env.NODE_ENV,
  output: {
    path: path.resolve(projectRoot, 'dist'),
    filename: 'symbolicator-cli.js',
  },
  entry: './src/symbolicator-cli/index.js',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ['babel-loader'],
        include: includes,
      },
    ],
  },
  experiments: {
    // Make WebAssembly work just like in webpack v4
    syncWebAssembly: true,
  },
};
