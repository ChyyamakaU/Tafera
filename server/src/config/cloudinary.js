const { v2: cloudinary } = require('cloudinary')
const env = require('./env')

cloudinary.config({
  cloud_name: env.CLOUDINARY.cloudName,
  api_key: env.CLOUDINARY.apiKey,
  api_secret: env.CLOUDINARY.apiSecret,
  secure: true,
})

module.exports = cloudinary
