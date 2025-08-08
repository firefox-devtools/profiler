const WebpackDevServer = require('webpack-dev-server');
const config = require('./webpack.config.js');
const webpack = require('webpack');

const port = process.env.FX_PROFILER_PHOTON_PORT || 4243;
const host = process.env.FX_PROFILER_PHOTON_HOST || 'localhost';

const serverConfig = {
  allowedHosts: ['localhost', '.gitpod.io'],
  host,
  port,
  static: false,
};

const server = new WebpackDevServer(serverConfig, webpack(config));
server
  .start()
  .then(function () {
    console.log(
      `> Photon styling is listening at: http://${host}:${port}/photon/\n`
    );
  })
  .catch((err) => console.log(err));
