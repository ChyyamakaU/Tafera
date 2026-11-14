'use strict'

// Scrapbook image upload reuses the destination image upload middleware,
// which provides multer memory storage, a single `image` field, a 5 MB size
// cap, MIME-type allowlisting and magic-byte content validation. No new
// dependencies or upload logic are introduced.
const {
  destinationImageUpload,
  validateImageFile,
} = require('./destinationImageUpload')

module.exports = {
  scrapbookImageUpload: destinationImageUpload,
  validateImageFile,
}
