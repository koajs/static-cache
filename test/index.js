var request = require('supertest')
var koa = require('koa')
var http = require('http')
var path = require('path')
var staticCache = require('..')

var app = koa()
app.use(staticCache(path.join(__dirname, '..')))

var server = http.createServer(app.callback())

var app2 = koa()
app.use(staticCache(path.join(__dirname, '..'), {
  buffer: true
}))

var server2 = http.createServer(app.callback())

describe('Static Cache', function () {
  var etag

  it('should serve files', function (done) {
    request(server)
    .get('/index.js')
    .expect(200)
    .expect('Cache-Control', 'public, max-age=0')
    .expect('Content-Type', /javascript/)
    .end(function (err, res) {
      if (err)
        return done(err)

      res.should.have.header('Content-Length')
      res.should.have.header('Last-Modified')
      res.should.have.header('ETag')

      etag = res.headers.etag

      done()
    })
  })

  it('should serve files as buffers', function (done) {
    request(server2)
    .get('/index.js')
    .expect(200)
    .expect('Cache-Control', 'public, max-age=0')
    .expect('Content-Type', /javascript/)
    .end(function (err, res) {
      if (err)
        return done(err)

      res.should.have.header('Content-Length')
      res.should.have.header('Last-Modified')
      res.should.have.header('ETag')

      etag = res.headers.etag

      done()
    })
  })

  it('should serve recursive files', function (done) {
    request(server)
    .get('/test/index.js')
    .expect(200)
    .expect('Cache-Control', 'public, max-age=0')
    .expect('Content-Type', /javascript/)
    .end(function (err, res) {
      if (err)
        return done(err)

      res.should.have.header('Content-Length')
      res.should.have.header('Last-Modified')
      res.should.have.header('ETag')

      done()
    })
  })

  it('should not serve hidden files', function (done) {
    request(server)
    .get('/.gitignore')
    .expect(404, done)
  })

  it('should be case sensitive', function (done) {
    request(server)
    .get('/Index.js')
    .expect(404, done)
  })

  it('should support conditional HEAD requests', function (done) {
    request(server)
    .head('/index.js')
    .set('If-None-Match', etag)
    .expect(304, done)
  })

  it('should support conditional GET requests', function (done) {
    request(server)
    .get('/index.js')
    .set('If-None-Match', etag)
    .expect(304, done)
  })

  it('should support HEAD', function (done) {
    request(server)
    .head('/index.js')
    .expect('', done)
  })

  it('should support OPTIONS', function (done) {
    request(server)
    .options('/index.js')
    .expect('Allow', 'HEAD,GET,OPTIONS')
    .expect(204)
    .expect('', done)
  })

  it('should support 405 Method Not Allowed', function (done) {
    request(server)
    .put('/index.js')
    .expect('Allow', 'HEAD,GET,OPTIONS')
    .expect(405, done)
  })

  it('should ignore query strings', function (done) {
    request(server)
    .get('/index.js?query=string')
    .expect(200, done)
  })
})