var crypto = require('crypto')
var fs = require('fs')
var path = require('path')
var mime = require('mime')

module.exports = function staticCache(dir, options) {
  options = options || {}

  if (typeof dir !== 'string')
    throw TypeError('Dir must be a defined string')

  var cacheControl = 'public, max-age=' + (options.maxAge || 0)
  var files = {}

  readDir(dir).forEach(function (name) {
    var pathname = '/' + name
    var obj = files[pathname] = {}
    var filename = obj.path = path.join(dir, name)
    var stats = fs.statSync(filename)
    var buffer = fs.readFileSync(filename)

    obj.type = mime.lookup(name)
    obj.mtime = new Date(stats.mtime)
    obj.length = stats.size
    obj.etag = '"' + crypto
      .createHash('md5')
      .update(buffer)
      .digest('hex') + '"'

    if (options.buffer)
      obj.buffer = buffer

    buffer = null
  })

  return function staticCache(next) {
    return function* () {
      var file = files[this.path]
      if (!file)
        return next()

      switch (this.method) {
        case 'HEAD':
        case 'GET':
          this.type = file.type
          this.set('Cache-Control', cacheControl)
          this.set('Content-Length', file.length)
          this.set('Last-Modified', file.mtime)
          this.set('ETag', file.etag)
          if (this.fresh)
            return this.status = 304
          if (this.method === 'GET')
            return this.body = file.buffer
              || fs.createReadStream(file.path)
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
}

// Recursively read the directory
function readDir(root, prefix, files) {
  prefix = prefix || ''
  files = files || []

  var dir = path.join(root, prefix)
  if (fs.lstatSync(dir).isDirectory()) {
    fs.readdirSync(dir).filter(function (name) {
      return name[0] !== '.'
    }).forEach(function (name) {
      readDir(root, path.join(prefix, name), files)
    })
  } else {
    files.push(prefix)
  }

  return files
}
