const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const OfflinePlugin = require('offline-plugin');

module.exports = {
  entry: [
    './index',
  ],
  output: {
    path: path.join(__dirname, 'static'),
    filename: '[hash].bundle.js',
    chunkFilename: '[id].[hash].bundle.js',
    publicPath: '/',
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
    }),
    new webpack.LoaderOptionsPlugin({
      options: {
        worker: {
          output: {
            filename: "[hash].worker.js",
            chunkFilename: "[id].[hash].worker.js"
          }
        }
      }
    }),
    new HtmlWebpackPlugin({
      title: 'Cleopatra',
      favicon: 'static/favicon.png',
      template: 'index.html',
    }),
    new OfflinePlugin({
      externals: ['treetwisty.svg', 'zoom-icon.svg'],
      relativePaths: false,
      AppCache: false,
      ServiceWorker: {
        scope: '/',
        navigateFallbackURL: '/',
      },
    }),
  ],
  resolve: {
    alias: {
      'redux-devtools/lib': path.join(__dirname, '..', '..', 'src'),
      'redux-devtools': path.join(__dirname, '..', '..', 'src'),
      'react': path.join(__dirname, 'node_modules', 'react'),
    },
    extensions: ['.js'],
  },
  module: {
    rules: [{
      test: /\.js$/,
      loaders: ['babel-loader'],
      exclude: /node_modules/,
      include: __dirname,
    }, {
      test: /\.css?$/,
      loaders: ['style-loader', 'css-loader?minimize'],
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
