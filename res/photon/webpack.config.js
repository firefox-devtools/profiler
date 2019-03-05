// @noflow
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const projectRoot = path.join(__dirname, '../..');

module.exports = {
  mode: 'production',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.css?$/,
        loaders: ['style-loader', 'css-loader'],
        include: [
          path.join(projectRoot, 'src'),
          path.join(projectRoot, 'res'),
          path.join(projectRoot, 'node_modules', 'photon-colors'),
        ],
      },
      {
        test: /\.(svg|png|jpg)$/,
        loader: 'file-loader',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'Photon Styling',
      template: 'res/photon/index.html',
    }),
  ],
  entry: './res/photon/index.js',
  output: {
    path: path.join(projectRoot, 'dist/photon'),
    filename: '[hash].bundle.js',
    chunkFilename: '[id].[hash].bundle.js',
    publicPath: '/photon/',
  },
};
