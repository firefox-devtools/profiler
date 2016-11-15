const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: [
    './index',
  ],
  output: {
    path: path.join(__dirname, 'static'),
    filename: 'bundle.js',
    publicPath: '/static/',
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
    }),
  ],
  resolve: {
    alias: {
      'redux-devtools/lib': path.join(__dirname, '..', '..', 'src'),
      'redux-devtools': path.join(__dirname, '..', '..', 'src'),
      'react': path.join(__dirname, 'node_modules', 'react'),
    },
    extensions: ['', '.js'],
  },
  resolveLoader: {
    'fallback': path.join(__dirname, 'node_modules'),
  },
  module: {
    loaders: [{
      test: /\.js$/,
      loaders: ['babel'],
      exclude: /node_modules/,
      include: __dirname,
    }, {
      test: /\.css?$/,
      loaders: ['style', 'raw'],
      include: __dirname,
    }],
  },
};

if (process.env.NODE_ENV === 'development') {
  module.exports.devtool = 'cheap-module-eval-source-map';
  module.exports.entry = [
    'webpack-dev-server/client?http://localhost:4242',
    'webpack/hot/only-dev-server',
    'react-hot-loader/patch'].concat(module.exports.entry);
  module.exports.plugins = [new webpack.HotModuleReplacementPlugin()].concat(module.exports.plugins);
} else if (process.env.NODE_ENV === 'development-no-hot') {
  module.exports.devtool = 'source-map';
  module.exports.entry = ['webpack-dev-server/client?http://localhost:4242'].concat(module.exports.entry);
}
