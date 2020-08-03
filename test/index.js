var fs = require('fs')
var crypto = require('crypto')
var zlib = require('zlib')
var request = require('supertest')
var should = require('should')
var Koa = require('koa')
var http = require('http')
var path = require('path')
var staticCache = require('..')
var LRU = require('ylru')

var app = new Koa()
var files = {}
app.use(staticCache(path.join(__dirname, '..'), {
  alias: {
    '/package': '/package.json'
  }
}, files))

// force the files' mtime
for (var key in files) {
  files[key].mtime = new Date()
}
var server = http.createServer(app.callback())

var app2 = new Koa()
app2.use(staticCache(path.join(__dirname, '..'), {
  buffer: true
}))
var server2 = http.createServer(app2.callback())

var app3 = new Koa()
app3.use(staticCache(path.join(__dirname, '..'), {
  buffer: true,
  gzip: true
}))
var server3 = http.createServer(app3.callback())

var app4 = new Koa()
var files4 = {}
app4.use(staticCache(path.join(__dirname, '..'), {
  gzip: true
}, files4))
// force the files' mtime
for (var key in files4) {
  files4[key].mtime = new Date()
}
var server4 = http.createServer(app4.callback())

var app5 = new Koa()
app5.use(staticCache({
  buffer: true,
  prefix: '/static',
  dir: path.join(__dirname, '..')
}))
var server5 = http.createServer(app5.callback())

describe('Static Cache', function () {

  it('should dir priority than options.dir', function (done) {
    var app = new Koa()
    app.use(staticCache(path.join(__dirname, '..'), {
      dir: __dirname
    }))
    var server = app.listen()
    request(server)
    .get('/index.js')
    .expect(200, done)
  })

  it('should default options.dir works fine', function (done) {
    var app = new Koa()
    app.use(staticCache({
      dir: path.join(__dirname, '..')
    }))
    var server = app.listen()
    request(server)
    .get('/index.js')
    .expect(200, done)
  })

  it('should accept abnormal path', function (done) {
    var app = new Koa()
    app.use(staticCache({
      dir: path.join(__dirname, '..')
    }))
    var server = app.listen()
    request(server)
    .get('//index.js')
    .expect(200, done)
  })

  it('should default process.cwd() works fine', function (done) {
    var app = new Koa()
    app.use(staticCache())
    var server = app.listen()
    request(server)
    .get('/index.js')
    .expect(200, done)
  })

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

      done()
    })
  })

  it('should not serve hidden files', function (done) {
    request(server)
    .get('/.gitignore')
    .expect(404, done)
  })

  it('should support HEAD', function (done) {
    request(server)
    .head('/index.js')
    .expect(200)
    .expect('', done)
  })

  it('should support 404 Not Found for other Methods to allow downstream',
  function (done) {
    request(server)
    .put('/index.js')
    .expect(404, done)
  })

  it('should ignore query strings', function (done) {
    request(server)
    .get('/index.js?query=string')
    .expect(200, done)
  })

  it('should alias paths', function (done) {
    request(server)
    .get('/package')
    .expect('Content-Type', /json/)
    .expect(200, done)
  })

  it('should be configurable via object', function (done) {
    files['/package.json'].maxAge = 1

    request(server)
    .get('/package.json')
    .expect('Cache-Control', 'public, max-age=1')
    .expect(200, done)
  })

  it('should set the etag and content-md5 headers', function (done) {
    var pk = fs.readFileSync('package.json')
    var md5 = crypto.createHash('md5').update(pk).digest('base64')

    request(server)
    .get('/package.json')
    .expect('ETag', '"' + md5 + '"')
    .expect('Content-MD5', md5)
    .expect(200, done)
  })

  it('should set Last-Modified if file modified and not buffered', function (done) {
    setTimeout(function () {
      var readme = fs.readFileSync('README.md', 'utf8')
      fs.writeFileSync('README.md', readme, 'utf8')
      var mtime = fs.statSync('README.md').mtime
      var md5 = files['/README.md'].md5
      request(server)
      .get('/README.md')
      .expect(200, function (err, res) {
        res.should.have.header('Content-Length')
        res.should.have.header('Last-Modified')
        res.should.not.have.header('ETag')
        files['/README.md'].mtime.should.eql(mtime)
        setTimeout(function () {
          files['/README.md'].md5.should.equal(md5)
        }, 10)
        done()
      })
    }, 1000)
  })

  it('should serve files with gzip buffer', function (done) {
    var index = fs.readFileSync('index.js')
    zlib.gzip(index, function (err, content) {
      request(server3)
      .get('/index.js')
      .set('Accept-Encoding', 'gzip')
      .expect(200)
      .expect('Cache-Control', 'public, max-age=0')
      .expect('Content-Encoding', 'gzip')
      .expect('Content-Type', /javascript/)
      .expect('Content-Length', content.length)
      .expect('Vary', 'Accept-Encoding')
      .expect(index.toString())
      .end(function (err, res) {
        if (err)
          return done(err)
        res.should.have.header('Content-Length')
        res.should.have.header('Last-Modified')

        etag = res.headers.etag

        done()
      })
    })
  })

  it('should not serve files with gzip buffer when accept encoding not include gzip',
  function (done) {
    var index = fs.readFileSync('index.js')
    request(server3)
    .get('/index.js')
    .set('Accept-Encoding', '')
    .expect(200)
    .expect('Cache-Control', 'public, max-age=0')
    .expect('Content-Type', /javascript/)
    .expect('Content-Length', index.length)
    .expect('Vary', 'Accept-Encoding')
    .expect(index.toString())
    .end(function (err, res) {
      if (err)
        return done(err)
      res.should.not.have.header('Content-Encoding')
      res.should.have.header('Content-Length')
      res.should.have.header('Last-Modified')
      res.should.have.header('ETag')
      done()
    })
  })

  it('should serve files with gzip stream', function (done) {
    var index = fs.readFileSync('index.js')
    zlib.gzip(index, function (err, content) {
      request(server4)
      .get('/index.js')
      .set('Accept-Encoding', 'gzip')
      .expect(200)
      .expect('Cache-Control', 'public, max-age=0')
      .expect('Content-Encoding', 'gzip')
      .expect('Content-Type', /javascript/)
      .expect('Vary', 'Accept-Encoding')
      .expect(index.toString())
      .end(function (err, res) {
        if (err)
          return done(err)
        res.should.not.have.header('Content-Length')
        res.should.have.header('Last-Modified')
        res.should.have.header('ETag')

        etag = res.headers.etag

        done()
      })
    })
  })

  it('should serve files with prefix', function (done) {
    request(server5)
    .get('/static/index.js')
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

  it('should 404 when dynamic = false', function (done) {
    var app = new Koa()
    app.use(staticCache({dynamic: false}))
    var server = app.listen()
    fs.writeFileSync('a.js', 'hello world')

    request(server)
      .get('/a.js')
      .expect(404, function(err) {
        fs.unlinkSync('a.js')
        done(err)
      })
  })

  it('should work fine when new file added in dynamic mode', function (done) {
    var app = new Koa()
    app.use(staticCache({dynamic: true}))
    var server = app.listen()
    fs.writeFileSync('a.js', 'hello world')

    request(server)
      .get('/a.js')
      .expect(200, function(err) {
        fs.unlinkSync('a.js')
        done(err)
      })
  })

  it('should work fine when new file added in dynamic and prefix mode', function (done) {
    var app = new Koa()
    app.use(staticCache({dynamic: true, prefix: '/static'}))
    var server = app.listen()
    fs.writeFileSync('a.js', 'hello world')

    request(server)
      .get('/static/a.js')
      .expect(200, function(err) {
        fs.unlinkSync('a.js')
        done(err)
      })
  })

  it('should work fine when new file added in dynamic mode with LRU', function (done) {
    var app = new Koa()
    var files = new LRU(1)
    app.use(staticCache({dynamic: true, files: files}))
    var server = app.listen()
    fs.writeFileSync('a.js', 'hello world a')
    fs.writeFileSync('b.js', 'hello world b')
    fs.writeFileSync('c.js', 'hello world b')

    request(server)
      .get('/a.js')
      .expect(200, function(err) {
        should.exist(files.get('/a.js'))
        should.not.exist(err)

        request(server)
          .get('/b.js')
          .expect(200, function (err) {
            should.not.exist(files.get('/a.js'))
            should.exist(files.get('/b.js'))
            should.not.exist(err)

            request(server)
              .get('/c.js')
              .expect(200, function (err) {
                should.not.exist(files.get('/b.js'))
                should.exist(files.get('/c.js'))
                should.not.exist(err)

                request(server)
                  .get('/a.js')
                  .expect(200, function (err) {
                    should.not.exist(files.get('/c.js'))
                    should.exist(files.get('/a.js'))
                    should.not.exist(err)
                    fs.unlinkSync('a.js')
                    fs.unlinkSync('b.js')
                    fs.unlinkSync('c.js')
                    done()
                  })
              })
          })
      })
  })

  it('should 404 when url without prefix in dynamic and prefix mode', function (done) {
    var app = new Koa()
    app.use(staticCache({dynamic: true, prefix: '/static'}))
    var server = app.listen()
    fs.writeFileSync('a.js', 'hello world')

    request(server)
      .get('/a.js')
      .expect(404, function(err) {
        fs.unlinkSync('a.js')
        done(err)
      })
  })

  it('should 404 when new hidden file added in dynamic mode', function (done) {
    var app = new Koa()
    app.use(staticCache({dynamic: true}))
    var server = app.listen()
    fs.writeFileSync('.a.js', 'hello world')

    request(server)
      .get('/.a.js')
      .expect(404, function(err) {
        fs.unlinkSync('.a.js')
        done(err)
      })
  })

  it('should 404 when file not exist in dynamic mode', function (done) {
    var app = new Koa()
    app.use(staticCache({dynamic: true}))
    var server = app.listen()
    request(server)
      .get('/a.js')
      .expect(404, done)
  })

  it('should 404 when file not exist', function (done) {
    var app = new Koa()
    app.use(staticCache({dynamic: true}))
    var server = app.listen()
    request(server)
      .get('/a.js')
      .expect(404, done)
  })

  it('should 404 when is folder in dynamic mode', function (done) {
    var app = new Koa()
    app.use(staticCache({dynamic: true}))
    var server = app.listen()
    request(server)
      .get('/test')
      .expect(404, done)
  })

  it('should array options.filter works fine', function (done) {
    var app = new Koa()
    app.use(staticCache({
      dir: path.join(__dirname, '..'),
      filter: ['index.js']
    }))
    var server = app.listen()
    request(server)
    .get('/Makefile')
    .expect(404, done)
  })

  it('should function options.filter works fine', function (done) {
    var app = new Koa()
    app.use(staticCache({
      dir: path.join(__dirname, '..'),
      filter: function (file) { return file.indexOf('index.js') === 0 }
    }))
    var server = app.listen()
    request(server)
    .get('/Makefile')
    .expect(404, done)
  })

  it('should options.dynamic and options.preload works fine', function (done) {
    var app = new Koa()
    var files = {}
    app.use(staticCache({
      dir: path.join(__dirname, '..'),
      preload: false,
      dynamic: true,
      files: files
    }))
    files.should.eql({})
    request(app.listen())
      .get('/Makefile')
      .expect(200, function (err, res) {
        should.not.exist(err)
        files.should.have.keys('/Makefile')
        done()
      })
  })

  it('should options.alias and options.preload works fine', function (done) {
    var app = new Koa()
    var files = {}
    app.use(staticCache({
      dir: path.join(__dirname, '..'),
      preload: false,
      dynamic: true,
      alias: {
        '/package': '/package.json'
      },
      files: files
    }))
    files.should.eql({})
    request(app.listen())
      .get('/package')
      .expect(200, function (err, res) {
        if (err) return done(err)
        should.not.exist(err)
        files.should.have.keys('/package.json')
        files.should.not.have.keys('/package')

        request(app.listen())
          .get('/package.json')
          .expect(200, function (err, res) {
            if (err) return done(err)
            should.not.exist(err)
            files.should.have.keys('/package.json')
            should.ok(Object.keys(files).length === 1)
            done()
          })
      })
  })


  it('should loadFile under options.dir', function (done) {
    var app = new Koa()
    app.use(staticCache({
      dir: __dirname,
      preload: false,
      dynamic: true,
    }))
    request(app.listen())
      .get('/%2E%2E/package.json')
      .expect(404)
      .end(done)
  })
})
