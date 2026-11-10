'use strict'

const crypto = require('crypto')

// 32 random bytes encoded as base64url produce a 43-character token with 256
// bits of entropy. Only the SHA-256 hash is persisted.
const VERIFICATION_TOKEN_BYTES = 32
const VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

const generateVerificationToken = () =>
  crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString('base64url')

const hashVerificationToken = (token) =>
  crypto.createHash('sha256').update(token, 'utf8').digest('hex')

const isWellFormedVerificationToken = (token) =>
  typeof token === 'string' && VERIFICATION_TOKEN_PATTERN.test(token)

module.exports = {
  VERIFICATION_TOKEN_BYTES,
  VERIFICATION_TOKEN_PATTERN,
  generateVerificationToken,
  hashVerificationToken,
  isWellFormedVerificationToken,
}
