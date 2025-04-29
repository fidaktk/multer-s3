const events = require('events')

function createMockS3 () {
  const config = {
    endpoint: () => ({
      href: 'http://mock-s3.local/'
    }),
    region: 'us-mock-1'
  }

  function send (opts, cb) {
    const ee = new events.EventEmitter()
    const buffer = opts.input.Body

    // Emit a mock upload progress event
    ee.emit('httpUploadProgress', { total: buffer.length })

    // Ensure opts.input.Bucket and opts.input.Key are defined
    opts.input.Bucket = opts.input.Bucket || 'mock-bucket'
    opts.input.Key = opts.input.Key || 'mock-key'

    const bucket = opts.input.Bucket
    const key = opts.input.Key

    // Return a mock response with the correct location
    const response = {
      Location: `http://mock-s3.local/${bucket}/${key}`,
      ETag: 'mock-etag'
    }

    if (cb) {
      cb(null, response)
    }

    return Promise.resolve(response)
  }

  return {
    send,
    config
  }
}

module.exports = createMockS3
