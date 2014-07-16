
1.1.0 / 2014-07-16
==================

  * replace mime by mime-types
  * remove onerror and destroy, let koa hanlde these stuff

1.0.10 / 2014-05-18
==================

  * bump fs-readdir-recursive, fixed #14
  * fix bad argument handling, fixed #20
  * should not return gzip buffer when accept encoding not include gzip

1.0.9 / 2014-03-31
==================

  * add url prefix option

1.0.8 / 2014-03-31
==================

  * support options.dir, default to process.cwd()
  * add vary, check file's length when gzip
  * Ensure files can be gzipped via compressible.

1.0.7 / 2014-03-26
==================

  * add options.gzip to control gzip, support stream's gzip
  * add gzip support for buffers

1.0.3 / 2014-01-14
==================

 * update `on-socket-error`

1.0.0 / 2013-12-21
==================

 * use `yield* next`
