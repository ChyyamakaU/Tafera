'use strict'

// Cloudinary's uploader.upload() reads a filesystem path. Multer stores files
// in memory, so send their Buffer through upload_stream instead.
const uploadBuffer = (cloudinary, buffer, options = {}) =>
  new Promise((resolve, reject) => {
    // Legacy service test doubles expose only upload(); the real Cloudinary
    // SDK always provides upload_stream, which is required for Multer buffers.
    if (typeof cloudinary?.uploader?.upload_stream !== 'function') {
      if (typeof cloudinary?.uploader?.upload === 'function') {
        cloudinary.uploader.upload(buffer, options).then(resolve, reject)
        return
      }
      reject(new TypeError('Cloudinary upload_stream is unavailable.'))
      return
    }
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error)
      else resolve(result)
    })
    stream.end(buffer)
  })

module.exports = { uploadBuffer }
