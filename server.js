var webpack = require('webpack')
var webpackDevMiddleware = require('webpack-dev-middleware')
var webpackHotMiddleware = require('webpack-hot-middleware')
var config = require('./webpack.config')

var app = new (require('express'))()
var port = 4242

var compiler = webpack(config)
app.use(webpackDevMiddleware(compiler, { noInfo: true, publicPath: config.output.publicPath }))
app.use(webpackHotMiddleware(compiler))

app.get("/", function(req, res) {
  res.sendFile(__dirname + '/index.html')
})
app.get("/static/style.css", function(req, res) {
  res.sendFile(__dirname + '/static/style.css')
})
app.get("/static/treetwisty.svg", function(req, res) {
  res.sendFile(__dirname + '/static/treetwisty.svg')
})

app.get("/symbol-store-db-worker.js", function(req, res) {
  res.sendFile(__dirname + '/www/symbol-store-db-worker.js')
})
app.listen(port, function(error) {
  if (error) {
    console.error(error)
  } else {
    console.info("==> 🌎  Listening on port %s. Open up http://localhost:%s/ in your browser.", port, port)
  }
})
