'use strict'

const multer = require('multer')
const {
  InvalidImageFileError,
} = require('../utils/destinationErrors')
const { MAX_IMAGE_FILE_SIZE, SUPPORTED_IMAGE_TYPES } = require('../validators/destination')

// Magic byte signatures for supported image formats.
// We validate the actual file contents rather than trusting the client-provided
// MIME type, which can be spoofed.
const MAGIC_BYTES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46], // 'RIFF' at offset 0
}

const WEBP_SIGNATURE_OFFSET = 8
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] // 'WEBP'

const matchesMagicBytes = (buffer, mimeType) => {
  const expected = MAGIC_BYTES[mimeType]

  if (!expected) return false

  if (buffer.length < expected.length) return false

  for (let i = 0; i < expected.length; i += 1) {
    if (buffer[i] !== expected[i]) return false
  }

  // WebP additionally requires the 'WEBP' signature at offset 8.
  if (mimeType === 'image/webp') {
    if (buffer.length < WEBP_SIGNATURE_OFFSET + WEBP_SIGNATURE.length) {
      return false
    }

    for (let i = 0; i < WEBP_SIGNATURE.length; i += 1) {
      if (
        buffer[WEBP_SIGNATURE_OFFSET + i] !== WEBP_SIGNATURE[i]
      ) {
        return false
      }
    }
  }

  return true
}

const validateImageFile = (file) => {
  const mimeType = file.mimetype

  if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    throw new InvalidImageFileError()
  }

  if (!matchesMagicBytes(file.buffer, mimeType)) {
    throw new InvalidImageFileError()
  }
}

const storage = multer.memoryStorage()

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_FILE_SIZE,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    try {
      // Reject non-image field names early so multer does not buffer them.
      if (file.fieldname !== 'image') {
        cb(new InvalidImageFileError())
        return
      }

      // MIME type and magic-byte validation happens after the buffer is fully
      // received, in the destination image upload handler, because multer's
      // fileFilter does not have access to the file buffer for memory storage.
      cb(null, true)
    } catch (error) {
      cb(error)
    }
  },
})

// Middleware that accepts exactly one image file in the 'image' field.
// Missing files, unsupported MIME types, oversized files, malformed multipart
// requests, and magic-byte mismatches all surface as InvalidImageFileError
// (400) through the project's standard error handler.
const destinationImageUpload = (req, res, next) => {
  upload.single('image')(req, res, (error) => {
    if (error) {
      // Multer surfaces size/field/count errors as MulterError; normalize them
      // to the project's standard InvalidImageFileError so clients receive a
      // consistent 400 response.
      if (
        error instanceof multer.MulterError &&
        (error.code === 'LIMIT_FILE_SIZE' ||
          error.code === 'LIMIT_FILE_COUNT' ||
          error.code === 'LIMIT_UNEXPECTED_FILE')
      ) {
        next(new InvalidImageFileError())
        return
      }

      // InvalidImageFileError thrown from fileFilter passes through directly.
      next(error)
      return
    }

    // A missing file is not an error for multer itself; it simply leaves
    // req.file undefined. We reject it explicitly.
    if (!req.file) {
      next(new InvalidImageFileError())
      return
    }

    // Validate the actual file contents (magic bytes) now that the buffer is
    // available. Multer's fileFilter cannot do this for memory storage because
    // the buffer is populated after the filter runs.
    try {
      validateImageFile(req.file)
    } catch (validationError) {
      next(validationError)
      return
    }

    next()
  })
}

module.exports = {
  destinationImageUpload,
  validateImageFile,
}
