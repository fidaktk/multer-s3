const crypto = require('crypto')
const stream = require('stream')
const fileType = require('file-type')
const htmlCommentRegex = require('html-comment-regex')
const parallel = require('run-parallel')
const Upload = require('@aws-sdk/lib-storage').Upload
const DeleteObjectCommand = require('@aws-sdk/client-s3').DeleteObjectCommand
const util = require('util')

function staticValue(value) {
  return function (req, file, cb) {
    cb(null, value)
  }
}

const defaultAcl = staticValue('private')
const defaultContentType = staticValue('application/octet-stream')

const defaultMetadata = staticValue(undefined)
const defaultCacheControl = staticValue(null)
const defaultContentDisposition = staticValue(null)
const defaultContentEncoding = staticValue(null)
const defaultStorageClass = staticValue('STANDARD')
const defaultSSE = staticValue(null)
const defaultSSEKMS = staticValue(null)

const svgRegex = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!doctype svg[^>]*>\s*)?<svg[^>]*>/i

function isSvg(svg) {
  svg = svg.replace(/\s*<!Entity\s+\S*\s*(?:"|')[^"]+(?:"|')\s*>/img, '')
  svg = svg.replace(/\[?(?:\s*<![A-Z]+[^>]*>\s*)*\]?/g, '')
  svg = svg.replace(htmlCommentRegex, '')
  return svgRegex.test(svg)
}

function defaultKey(req, file, cb) {
  crypto.randomBytes(16, function (err, raw) {
    cb(err, err ? undefined : raw.toString('hex'))
  })
}

function autoContentType(req, file, cb) {
  file.stream.once('data', function (firstChunk) {
    const type = fileType(firstChunk)
    let mime = 'application/octet-stream'
    if ((!type || type.ext === 'xml') && isSvg(firstChunk.toString())) {
      mime = 'image/svg+xml'
    } else if (type) {
      mime = type.mime
    }
    const outStream = new stream.PassThrough()
    outStream.write(firstChunk)
    file.stream.pipe(outStream)
    cb(null, mime, outStream)
  })
}

function collect(storage, req, file, cb) {
  parallel([
    storage.getBucket.bind(storage, req, file),
    storage.getKey.bind(storage, req, file),
    storage.getAcl.bind(storage, req, file),
    storage.getMetadata.bind(storage, req, file),
    storage.getCacheControl.bind(storage, req, file),
    storage.getContentDisposition.bind(storage, req, file),
    storage.getStorageClass.bind(storage, req, file),
    storage.getSSE.bind(storage, req, file),
    storage.getSSEKMS.bind(storage, req, file),
    storage.getContentEncoding.bind(storage, req, file)
  ], function (err, values) {
    if (err) return cb(err)
    storage.getContentType(req, file, function (err, contentType, replacementStream) {
      if (err) return cb(err)
      cb.call(storage, null, {
        bucket: values[0],
        key: values[1],
        acl: values[2],
        metadata: values[3],
        cacheControl: values[4],
        contentDisposition: values[5],
        storageClass: values[6],
        contentType,
        replacementStream,
        serverSideEncryption: values[7],
        sseKmsKeyId: values[8],
        contentEncoding: values[9]
      })
    })
  })
}

function S3Storage(opts) {
  switch (typeof opts.s3) {
    case 'object': this.s3 = opts.s3; break
    default: throw new TypeError('Expected opts.s3 to be object')
  }
  switch (typeof opts.bucket) {
    case 'function': this.getBucket = opts.bucket; break
    case 'string': this.getBucket = staticValue(opts.bucket); break
    case 'undefined': throw new Error('bucket is required')
    default: throw new TypeError('Expected opts.bucket to be undefined, string or function')
  }
  switch (typeof opts.key) {
    case 'function': this.getKey = opts.key; break
    case 'undefined': this.getKey = defaultKey; break
    default: throw new TypeError('Expected opts.key to be undefined or function')
  }
  switch (typeof opts.acl) {
    case 'function': this.getAcl = opts.acl; break
    case 'string': this.getAcl = staticValue(opts.acl); break
    case 'undefined': this.getAcl = defaultAcl; break
    default: throw new TypeError('Expected opts.acl to be undefined, string or function')
  }
  switch (typeof opts.contentType) {
    case 'function': this.getContentType = opts.contentType; break
    case 'undefined': this.getContentType = defaultContentType; break
    default: throw new TypeError('Expected opts.contentType to be undefined or function')
  }
  switch (typeof opts.metadata) {
    case 'function': this.getMetadata = opts.metadata; break
    case 'undefined': this.getMetadata = defaultMetadata; break
    default: throw new TypeError('Expected opts.metadata to be undefined or function')
  }
  switch (typeof opts.cacheControl) {
    case 'function': this.getCacheControl = opts.cacheControl; break
    case 'string': this.getCacheControl = staticValue(opts.cacheControl); break
    case 'undefined': this.getCacheControl = defaultCacheControl; break
    default: throw new TypeError('Expected opts.cacheControl to be undefined, string or function')
  }
  switch (typeof opts.contentDisposition) {
    case 'function': this.getContentDisposition = opts.contentDisposition; break
    case 'string': this.getContentDisposition = staticValue(opts.contentDisposition); break
    case 'undefined': this.getContentDisposition = defaultContentDisposition; break
    default: throw new TypeError('Expected opts.contentDisposition to be undefined, string or function')
  }
  switch (typeof opts.contentEncoding) {
    case 'function': this.getContentEncoding = opts.contentEncoding; break
    case 'string': this.getContentEncoding = staticValue(opts.contentEncoding); break
    case 'undefined': this.getContentEncoding = defaultContentEncoding; break
    default: throw new TypeError('Expected opts.contentEncoding to be undefined, string or function')
  }
  switch (typeof opts.storageClass) {
    case 'function': this.getStorageClass = opts.storageClass; break
    case 'string': this.getStorageClass = staticValue(opts.storageClass); break
    case 'undefined': this.getStorageClass = defaultStorageClass; break
    default: throw new TypeError('Expected opts.storageClass to be undefined, string or function')
  }
  switch (typeof opts.serverSideEncryption) {
    case 'function': this.getSSE = opts.serverSideEncryption; break
    case 'string': this.getSSE = staticValue(opts.serverSideEncryption); break
    case 'undefined': this.getSSE = defaultSSE; break
    default: throw new TypeError('Expected opts.serverSideEncryption to be undefined, string or function')
  }
  switch (typeof opts.sseKmsKeyId) {
    case 'function': this.getSSEKMS = opts.sseKmsKeyId; break
    case 'string': this.getSSEKMS = staticValue(opts.sseKmsKeyId); break
    case 'undefined': this.getSSEKMS = defaultSSEKMS; break
    default: throw new TypeError('Expected opts.sseKmsKeyId to be undefined, string, or function')
  }
  if (typeof opts.shouldTransform === 'function') {
    this.shouldTransform = opts.shouldTransform
  } else if (opts.shouldTransform === true || opts.shouldTransform === 1) {
    this.shouldTransform = () => true
  } else if (opts.shouldTransform === false || opts.shouldTransform === 0 || typeof opts.shouldTransform === 'undefined') {
    this.shouldTransform = () => false
  } else {
    throw new TypeError('Expected opts.shouldTransform to be undefined, function, boolean, or 0/1')
  }
  switch (typeof opts.transforms) {
    case 'object': this.transforms = opts.transforms; break
    case 'undefined': this.transforms = null; break
    default: throw new TypeError('Expected opts.transforms to be undefined or array')
  }
}

S3Storage.prototype._handleFile = function (req, file, cb) {
  collect(this, req, file, (err, opts) => {
    if (err) return cb(err)

    const uploadToS3 = (stream, key, done) => {
      let currentSize = 0
      const params = {
        Bucket: opts.bucket,
        Key: key,
        ACL: opts.acl,
        CacheControl: opts.cacheControl,
        ContentType: opts.contentType,
        Metadata: opts.metadata,
        StorageClass: opts.storageClass,
        ServerSideEncryption: opts.serverSideEncryption,
        SSEKMSKeyId: opts.sseKmsKeyId,
        Body: stream
      }

      if (opts.contentDisposition) {
        params.ContentDisposition = opts.contentDisposition
      }

      if (opts.contentEncoding) {
        params.ContentEncoding = opts.contentEncoding
      }

      const upload = new Upload({
        client: this.s3,
        params
      })

      upload.on('httpUploadProgress', (ev) => {
        if (ev.total) currentSize = ev.total
      })

      util.callbackify(upload.done.bind(upload))((err, result) => {
        if (err) return done(err)
        done(null, {
          size: currentSize,
          bucket: opts.bucket,
          key: key,
          acl: opts.acl,
          contentType: opts.contentType,
          contentDisposition: opts.contentDisposition,
          contentEncoding: opts.contentEncoding,
          storageClass: opts.storageClass,
          serverSideEncryption: opts.serverSideEncryption,
          metadata: opts.metadata,
          location: result.Location,
          etag: result.ETag,
          versionId: result.VersionId
        })
      })
    }

    if (!this.shouldTransform || !this.shouldTransform(req, file)) {
      uploadToS3(opts.replacementStream || file.stream, opts.key, cb)
    } else {
      const results = []
      const transforms = this.transforms || []
      let completed = 0
      for (let i = 0; i < transforms.length; i++) {
        transforms[i].transform(req, file, (err, piper, fileName) => {
          if (err) return cb(err)
          if (!piper || typeof piper.pipe !== 'function') {
            return cb(new Error('Transform must return a stream'))
          }
          const key = fileName || `${opts.key}-${i}`
          const stream = (opts.replacementStream || file.stream).pipe(piper)

          uploadToS3.call(this, stream, key, (err, result) => {
            if (err) return cb(err)
            results[i] = result
            completed++
            if (completed === transforms.length) {
              cb(null, transforms.length === 1 ? results[0] : results)
            }
          })
        })
      }
    }
  })
}

S3Storage.prototype._removeFile = function (req, file, cb) {
  this.s3.send(
    new DeleteObjectCommand({
      Bucket: file.bucket,
      Key: file.key
    }),
    cb
  )
}

module.exports = function (opts) {
  return new S3Storage(opts)
}

module.exports.AUTO_CONTENT_TYPE = autoContentType
module.exports.DEFAULT_CONTENT_TYPE = defaultContentType