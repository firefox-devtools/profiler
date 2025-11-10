const path = require('path');
const projectRoot = path.join(__dirname, '../..');
const includes = [path.join(projectRoot, 'src')];

module.exports = {
  name: 'profile-query',
  target: 'node',
  mode: process.env.NODE_ENV,
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  output: {
    path: path.resolve(projectRoot, 'dist'),
    filename: 'profile-query.js',
    library: {
      type: 'commonjs2',
    },
    globalObject: 'this',
  },
  entry: './src/profile-query/index.ts',
  module: {
    rules: [
      {
        test: /\.(js|ts|tsx)$/,
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
  optimization: {
    minimize: false,
  },
};
