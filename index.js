var crypto = require('crypto')
var fs = require('fs')
var path = require('path')
var mime = require('mime')
var readDir = require('fs-readdir-recursive')
var debug = require('debug')('koa-static-cache')

module.exports = function staticCache(dir, options, files) {
  if (typeof dir !== 'string')
    throw TypeError('Dir must be a defined string')

  options = options || {}
  files = files || options.files || {}

  readDir(dir).forEach(function (name) {
    var pathname = '/' + name
    var obj = files[pathname] = {}
    var filename = obj.path = path.join(dir, name)
    var stats = fs.statSync(filename)
    var buffer = fs.readFileSync(filename)

    obj.cacheControl = options.cacheControl
    obj.maxAge = options.maxAge || 0
    obj.type = obj.mime = mime.lookup(pathname)
    obj.mtime = new Date(stats.mtime).toUTCString()
    obj.length = stats.size
    obj.etag = '"' + crypto
      .createHash('md5')
      .update(buffer)
      .digest('hex') + '"'

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
        this.set('Last-Modified', file.mtime)
        this.set('ETag', file.etag)
        if (this.fresh)
          return this.status = 304

        this.body = this.method === 'GET'
          ? file.buffer || fs.createReadStream(file.path)
          : ''
        this.type = file.type
        this.length = file.length
        this.set('Cache-Control', file.cacheControl || 'public, max-age=' + file.maxAge)

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
