const { z } = require('zod')
const {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} = require('../config/password')

// Count Unicode code points rather than UTF-16 code units so that emoji and
// other astral characters count as one character each. No trimming or
// normalisation is performed: the exact string supplied is the password.
const countCharacters = (value) => {
  let count = 0

  for (const _character of value) {
    count += 1
  }

  return count
}

const passwordSchema = z
  .string({ message: 'Password must be a string.' })
  .superRefine((password, ctx) => {
    const length = countCharacters(password)

    if (length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Password is required.',
      })
      return
    }

    if (length < PASSWORD_MIN_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
      })
    }

    if (length > PASSWORD_MAX_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`,
      })
    }
  })

module.exports = {
  countCharacters,
  passwordSchema,
}
