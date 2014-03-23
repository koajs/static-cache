var koa = require('koa')
var staticCache = require('./')

var app = koa()

app.use(staticCache(__dirname, {
  // buffer: true
}));

if (!module.parent) {
  app.listen(7001);
  console.log('server listen at 7001');
}

module.exports = app.callback();
