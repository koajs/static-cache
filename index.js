var crypto = require('crypto')
var fs = require('mz/fs')
var zlib = require('mz/zlib')
var path = require('path')
var mime = require('mime-types')
var compressible = require('compressible')
var readDir = require('fs-readdir-recursive')
var debug = require('debug')('koa-static-cache')

module.exports = function staticCache(dir, options, files) {
  if (typeof dir === 'object') {
    files = options
    options = dir
    dir = null
  }

  options = options || {}
  // prefix must be ASCII code
  options.prefix = (options.prefix || '').replace(/\/*$/, '/')
  files = files || options.files || Object.create(null)
  dir = dir || options.dir || process.cwd()
  var enableGzip = !!options.gzip
  var filePrefix = path.normalize(options.prefix.replace(/^\//, ''))

  // option.filter
  var fileFilter = function () { return true }
  if (Array.isArray(options.filter)) fileFilter = function (file) { return ~options.filter.indexOf(file) }
  if (typeof options.filter === 'function') fileFilter = options.filter

  if (options.preload !== false) {
    readDir(dir).filter(fileFilter).forEach(function (name) {
      loadFile(name, dir, options, files)
    })
  }

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
    // only accept HEAD and GET
    if (this.method !== 'HEAD' && this.method !== 'GET') return yield next
    // check prefix first to avoid calculate
    if (this.path.indexOf(options.prefix) !== 0) return yield next

    // decode for `/%E4%B8%AD%E6%96%87`
    // normalize for `//index`
    var filename = safeDecodeURIComponent(path.normalize(this.path))

    var file = files[filename]

    // try to load file
    if (!file) {
      if (!options.dynamic) return yield next
      if (path.basename(filename)[0] === '.') return yield next
      if (filename.charAt(0) === path.sep) filename = filename.slice(1)

      // trim prefix
      if (options.prefix !== '/') {
        if (filename.indexOf(filePrefix) !== 0) return yield next
        filename = filename.slice(filePrefix.length)
      }

      var s
      try {
        s = yield fs.stat(path.join(dir, filename))
      } catch (err) {
        return yield next
      }
      if (!s.isFile()) return yield next

      file = loadFile(filename, dir, options, files)
    }

    this.status = 200

    if (enableGzip) this.vary('Accept-Encoding')

    if (!file.buffer) {
      var stats = yield fs.stat(file.path)
      if (stats.mtime > file.mtime) {
        file.mtime = stats.mtime
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
    this.set('cache-control', file.cacheControl || 'public, max-age=' + file.maxAge)
    if (file.md5) this.set('content-md5', file.md5)

    if (this.method === 'HEAD')
      return

    var acceptGzip = this.acceptsEncodings('gzip') === 'gzip'

    if (file.zipBuffer) {
      if (acceptGzip) {
        this.set('content-encoding', 'gzip')
        this.body = file.zipBuffer
      } else {
        this.body = file.buffer
      }
      return
    }

    var shouldGzip = enableGzip
      && file.length > 1024
      && acceptGzip
      && compressible(file.type)

    if (file.buffer) {
      if (shouldGzip) {

        var gzFile = files[filename + '.gz']
        if (options.usePrecompiledGzip && gzFile && gzFile.buffer) { // if .gz file already read from disk
          file.zipBuffer = gzFile.buffer
        } else {
          file.zipBuffer = yield zlib.gzip(file.buffer)
        }
        this.set('content-encoding', 'gzip')
        this.body = file.zipBuffer
      } else {
        this.body = file.buffer
      }
      return
    }

    var stream = fs.createReadStream(file.path)

    // update file hash
    if (!file.md5) {
      var hash = crypto.createHash('md5')
      stream.on('data', hash.update.bind(hash))
      stream.on('end', function () {
        file.md5 = hash.digest('base64')
      })
    }

    this.body = stream
    // enable gzip will remove content length
    if (shouldGzip) {
      this.remove('content-length')
      this.set('content-encoding', 'gzip')
      this.body = stream.pipe(zlib.createGzip())
    }
  }
}

function safeDecodeURIComponent(text) {
  try {
    return decodeURIComponent(text)
  } catch (e) {
    return text
  }
}

/**
 * load file and add file content to cache
 *
 * @param {String} name
 * @param {String} dir
 * @param {Object} options
 * @param {Object} files
 * @return {Object}
 * @api private
 */

function loadFile(name, dir, options, files) {
  var pathname = path.normalize(path.join(options.prefix, name))
  var obj = files[pathname] = files[pathname] ? files[pathname] : {}
  var filename = obj.path = path.join(dir, name)
  var stats = fs.statSync(filename)
  var buffer = fs.readFileSync(filename)

  obj.cacheControl = options.cacheControl
  obj.maxAge = obj.maxAge ? obj.maxAge : options.maxAge || 0
  obj.type = obj.mime = mime.lookup(pathname) || 'application/octet-stream'
  obj.mtime = stats.mtime
  obj.length = stats.size
  obj.md5 = crypto.createHash('md5').update(buffer).digest('base64')

  debug('file: ' + JSON.stringify(obj, null, 2))
  if (options.buffer)
    obj.buffer = buffer

  buffer = null
  return obj
}
