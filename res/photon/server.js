// @noflow
const express = require('express');
const webpack = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');

const app = express();
const config = require('./webpack.config.js');
const compiler = webpack(config);

const port = process.env.FX_PROFILER_PORT || 4242;
const host = process.env.FX_PROFILER_HOST || 'localhost';

// Tell express to use the webpack-dev-middleware and use the webpack.config.js
// configuration file as a base.
app.use(
  webpackDevMiddleware(compiler, {
    publicPath: config.output.publicPath,
  })
);

app.listen(port, host, function() {
  console.log(
    `> Photon styling is listening at: http://${host}:${port}/photon/\n`
  );
});
