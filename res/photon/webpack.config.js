// @noflow
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const projectRoot = path.join(__dirname, '../..');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
module.exports = {
  mode: 'production',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.css?$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
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
      // Injecting the script into the head of the document stops the content from
      // flashing once without any styles applied.
      inject: 'head',
    }),
    new MiniCssExtractPlugin(),
  ],
  entry: './res/photon/index.js',
  output: {
    path: path.join(projectRoot, 'dist/photon'),
    filename: '[fullhash].bundle.js',
    chunkFilename: '[id].[fullhash].bundle.js',
    publicPath: '/photon/',
  },
};
