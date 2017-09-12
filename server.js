const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const config = require('./webpack.config');
const { oneLine } = require('common-tags');
const baseConfig = config[0];
const port = process.env.PERFHTML_PORT || 4242;

new WebpackDevServer(webpack(config), {
  contentBase: baseConfig.output.path,
  publicPath: baseConfig.output.publicPath,
  hot: process.env.NODE_ENV === 'development' ? true : false,
  historyApiFallback: {
    disableDotRule: true,
  },
  headers: {
    // See res/.htaccess for more information about all these headers.
    // /!\ Don't forget to keep it sync-ed with the headers here /!\
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': oneLine`
      default-src 'self';
      script-src 'self' 'sha256-eRTCQnd2fhPykpATDzCv4gdVk/EOdDq+6yzFXaWgGEw=' https://api-ssl.bitly.com;
      style-src 'self' 'unsafe-inline';
      img-src *;
      object-src 'none';
      connect-src *;
      frame-ancestors 'self';
      form-action 'none'
    `, // NOTE: no upgrade-insecure-requests because we're serving as HTTP.
  },
  stats: {
    colors: true,
  },
}).listen(port, 'localhost', function(err) {
  if (err) {
    console.log(err);
  }

  console.log(`Listening at localhost:${port}`);
  if (port === 4242) {
    console.log(
      'You can change this default port with the environment variable PERFHTML_PORT.'
    );
  }
});
