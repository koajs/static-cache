var crypto = require('crypto')
var fs = require('fs')
var zlib = require('zlib')
var path = require('path')
var mime = require('mime')
var compressible = require('compressible')
var onFinished = require('finished')
var readDir = require('fs-readdir-recursive')
var debug = require('debug')('koa-static-cache')

var stat = function (file) {
  return function (done) {
    fs.stat(file, done)
  }
}

function gzip(buf) {
  return function (done) {
    zlib.gzip(buf, done)
  }
}

module.exports = function staticCache(dir, options, files) {
  if (typeof dir === 'object') {
    options = dir
    files = options
    dir = null
  }

  options = options || {}
  options.prefix = (options.prefix || '').replace(/\/$/, '') + '/'
  files = files || options.files || Object.create(null)
  dir = dir || options.dir || process.cwd()
  var enableGzip = !!options.gzip

  readDir(dir).forEach(function (name) {
    name = name.replace(/\\/g, '/')
    var pathname = options.prefix + name
    var obj = files[pathname] = {}
    var filename = obj.path = path.join(dir, name)
    var stats = fs.statSync(filename)
    var buffer = fs.readFileSync(filename)

    obj.cacheControl = options.cacheControl
    obj.maxAge = options.maxAge || 0
    obj.type = obj.mime = mime.lookup(pathname)
    obj.mtime = stats.mtime.toUTCString()
    obj.length = stats.size
    obj.md5 = crypto.createHash('md5').update(buffer).digest('base64')

    debug('file: ' + JSON.stringify(obj, null, 2))
    if (options.buffer)
      obj.buffer = buffer

    buffer = null
  })

  if (options.alias) {
    Object.keys(options.alias).forEach(function (key) {
      var value = options.alias[key]

      if (files[value]) {
        files[key] = files[value]

        debug('aliasing ' + value + ' as ' + key)
      }
    })
  }

  return function* staticCache(next) {
    var file = files[this.path]
    if (!file)
      return yield* next

    switch (this.method) {
      case 'HEAD':
      case 'GET':
        this.status = 200

        if (enableGzip) this.vary('Accept-Encoding')

        if (!file.buffer) {
          var stats = yield stat(file.path)
          if (stats.mtime > new Date(file.mtime)) {
            file.mtime = stats.mtime.toUTCString()
            file.md5 = null
            file.length = stats.size
          }
        }

        this.response.lastModified = file.mtime
        if (file.md5) this.response.etag = file.md5

        if (this.fresh)
          return this.status = 304

        this.type = file.type
        this.length = file.zipBuffer ? file.zipBuffer.length : file.length
        this.set('Cache-Control', file.cacheControl || 'public, max-age=' + file.maxAge)
        if (file.md5) this.set('Content-MD5', file.md5)

        if (this.method === 'HEAD')
          return

        if (file.zipBuffer) {
          this.set('Content-Encoding', 'gzip')
          this.body = file.zipBuffer
          return
        }

        var shouldGzip = enableGzip
          && file.length > 1024
          && this.acceptsEncodings('gzip') === 'gzip'
          && compressible(file.type)

        if (file.buffer) {
          if (shouldGzip) {
            file.zipBuffer = yield gzip(file.buffer)
            this.set('Content-Encoding', 'gzip')
            this.body = file.zipBuffer
          } else {
            this.body = file.buffer
          }
          return
        }

        var stream = fs.createReadStream(file.path)
        stream.on('error', this.onerror)

        // update file hash
        if (!file.md5) {
          var hash = crypto.createHash('md5')
          stream.on('data', hash.update.bind(hash))
          stream.on('end', function () {
            file.md5 = hash.digest('base64')
          })
        }

        // enable gzip will remove content length
        if (shouldGzip) {
          this.remove('Content-Length')
          this.set('Content-Encoding', 'gzip')
          this.body = stream.pipe(zlib.createGzip())
        } else {
          this.body = stream
        }
        onFinished(this, stream.destroy.bind(stream))
        return
      case 'OPTIONS':
        this.status = 204
        this.set('Allow', 'HEAD,GET,OPTIONS')
        return
      default:
        this.status = 405
        this.set('Allow', 'HEAD,GET,OPTIONS')
        return
    }
  }
}
