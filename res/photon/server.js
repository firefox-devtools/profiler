// @noflow
const WebpackDevServer = require('webpack-dev-server');
const config = require('./webpack.config.js');
const webpack = require('webpack');

const port = process.env.FX_PROFILER_PHOTON_PORT || 4243;
const host = process.env.FX_PROFILER_PHOTON_HOST || 'localhost';

const serverConfig = {
  allowedHosts: ['localhost', '.gitpod.io'],
  contentBase: config.output.path,
  publicPath: config.output.publicPath,
  stats: {
    colors: true,
  },
};

new WebpackDevServer(webpack(config), serverConfig).listen(port, host, function(
  err
) {
  if (err) {
    console.log(err);
  }
  console.log(
    `> Photon styling is listening at: http://${host}:${port}/photon/\n`
  );
});
