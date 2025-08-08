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
        use: ['style-loader', 'css-loader'],
        include: [
          path.join(projectRoot, 'src'),
          path.join(projectRoot, 'res'),
          path.join(projectRoot, 'node_modules', 'photon-colors'),
        ],
      },
      {
        test: /\.(svg|png|jpg)$/,
        type: 'asset/resource',
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
  ],
  entry: './res/photon/index.js',
  output: {
    path: path.join(projectRoot, 'dist/photon'),
    filename: '[name].[contenthash].bundle.js',
    publicPath: '/photon/',
  },
};
