var crypto = require('crypto')
var fs = require('fs')
var path = require('path')
var mime = require('mime')

module.exports = function staticCache(dir, options) {
  options = options || {}

  if (typeof dir !== 'string')
    throw TypeError('Dir must be a defined string')

  var maxAge = options.maxAge || 0
  maxAge = maxAge && 'public, max-age="' + maxAge

  var files = fs.readdirSync(dir)
  .filter(function (name) {
    return name[0] !== '.'
  })
  .map(function (name) {
    var file = path.join(dir, name)
    var stats = fs.statSync(file)
    var obj = {
      pathname: '/' + name,
      path: file,
      type: mime.lookup(name),
      mtime: new Date(stats.mtime),
      length: stats.size
    }

    // Asynchronously retrieve the md5 hash of the file
    fs.createReadStream(file)
    .pipe(crypto.createHash('md5'))
    .on('readable', function () {
      obj.etag = this.read().toString('hex')
    })

    return obj
  })

  return function (next) {
    return function* () {
      var file = files[this.path]
      if (!file)
        return next()

      switch (this.method) {
        case 'OPTIONS':
          this.status = 204
          this.set('Allow', 'HEAD,GET,OPTIONS')
          return
        case 'HEAD':
        case 'GET':
          this.type = file.type
          this.set('Content-Length', file.length)
          this.set('Last-Modified', file.mtime)
          this.set('ETag', file.etag)
          if (maxAge)
            this.set('Cache-Control', maxAge)
          if (this.fresh)
            return this.status = 304
          if (this.method === 'GET')
            this.body = fs.createReadStream(file.path)
          return
        default:
          this.status = 405
          this.set('Allow', 'HEAD,GET,OPTIONS')
          return
      }
    }
  }
}