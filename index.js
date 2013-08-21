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
    var buffer = obj.buffer = fs.readFileSync(filename)

    obj.pathname = pathname
    obj.type = mime.lookup(name)
    obj.mtime = new Date(fs.statSync(filename).mtime)
    obj.length = buffer.length
    obj.etag = '"' + crypto.createHash('md5').update(buffer).digest('hex') + '"'
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
          this.set('Cache-Control', cacheControl)
          this.set('Content-Length', file.length)
          this.set('Last-Modified', file.mtime)
          this.set('ETag', file.etag)
          this.body = file.buffer
          if (this.fresh)
            this.status = 304
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