const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const config = require('./webpack.config');
const baseConfig = config[0];

new WebpackDevServer(webpack(config), {
  contentBase: baseConfig.output.path,
  publicPath: baseConfig.output.publicPath,
  hot: process.env.NODE_ENV === 'development' ? true : false,
  historyApiFallback: true,
  stats: {
    colors: true,
  },
}).listen(4242, 'localhost', function (err) {
  if (err) {
    console.log(err);
  }

  console.log('Listening at localhost:4242');
});
