require('dotenv').config({ quiet: true })

const { z } = require('zod')

const NODE_ENVIRONMENTS = ['development', 'test', 'production']
const MIN_SECRET_LENGTH = 32
const DURATION_PATTERN = /^\d+(ms|[smhdwy])?$/i

const isPresent = (value) => value !== undefined && value !== null && value !== ''

const emptyToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const isUrlWithProtocols = (value, protocols) => {
  try {
    const url = new URL(value)
    return protocols.includes(url.protocol) && Boolean(url.hostname)
  } catch {
    return false
  }
}

const isPostgresUrl = (value) =>
  isUrlWithProtocols(value, ['postgres:', 'postgresql:'])

const isRedisUrl = (value) =>
  isUrlWithProtocols(value, ['redis:', 'rediss:'])

const optionalString = (message) =>
  z.preprocess(emptyToUndefined, z.string().trim().min(1, message).optional())

const parseTrustProxy = (value) => {
  if (!isPresent(value)) return false

  const normalized = String(value).trim().toLowerCase()
  if (normalized === '') return false
  if (normalized === 'false') return false
  if (normalized === 'true') return true
  if (/^\d+$/.test(normalized)) return Number(normalized)

  return value
}

const optionalPort = (defaultPort) =>
  z.preprocess(
    (value) => (isPresent(value) ? value : String(defaultPort)),
    z
      .string()
      .trim()
      .regex(/^\d+$/, 'must be an integer between 1 and 65535')
      .transform(Number)
      .refine(
        (value) => value >= 1 && value <= 65535,
        'must be between 1 and 65535',
      ),
  )

const requiredSecret = z.preprocess(
  (value) => (value === undefined || value === null ? '' : value),
  z
    .string()
    .min(1, 'is required')
    .refine((value) => value.trim().length > 0, 'must not be blank')
    .min(
      MIN_SECRET_LENGTH,
      `must be at least ${MIN_SECRET_LENGTH} characters`,
    ),
)

const optionalSecret = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .min(
      MIN_SECRET_LENGTH,
      `must be at least ${MIN_SECRET_LENGTH} characters when set`,
    )
    .optional(),
)

const schema = z
  .object({
    NODE_ENV: z.preprocess(
      emptyToUndefined,
      z
        .enum(NODE_ENVIRONMENTS, {
          message: 'must be one of: development, test, production',
        })
        .default('development'),
    ),
    PORT: optionalPort(5001),
    TRUST_PROXY: z.preprocess(
      parseTrustProxy,
      z.union(
        [
          z.boolean(),
          z
            .number()
            .int()
            .min(
              0,
              'must be false, true, or a non-negative integer hop count',
            ),
        ],
        {
          message:
            'must be false, true, or a non-negative integer hop count',
        },
      ),
    ),
    CLIENT_URL: z.preprocess(
      emptyToUndefined,
      z.string().trim().url('must be a valid URL').optional(),
    ),
    DATABASE_URL: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .refine(
          isPostgresUrl,
          'must be a valid postgres:// or postgresql:// URL',
        )
        .optional(),
    ),
    DB_HOST: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(1, 'must not be empty').default('localhost'),
    ),
    DB_PORT: optionalPort(5432),
    DB_NAME: optionalString('must not be empty'),
    DB_USER: optionalString('must not be empty'),
    DB_PASSWORD: z.preprocess(
      (value) => (value === undefined ? '' : value),
      z.string(),
    ),
    REDIS_URL: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .refine(isRedisUrl, 'must be a valid redis:// or rediss:// URL')
        .optional(),
    ),
    SESSION_SECRET: requiredSecret,
    JWT_ACCESS_SECRET: optionalSecret,
    JWT_REFRESH_SECRET: optionalSecret,
    JWT_ACCESS_EXPIRES_IN: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .regex(
          DURATION_PATTERN,
          'must be a duration such as 15m, 7d, or a number of seconds',
        )
        .default('15m'),
    ),
    JWT_REFRESH_EXPIRES_IN: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .regex(
          DURATION_PATTERN,
          'must be a duration such as 15m, 7d, or a number of seconds',
        )
        .default('7d'),
    ),
    CLOUDINARY_CLOUD_NAME: optionalString('must not be empty'),
    CLOUDINARY_API_KEY: optionalString('must not be empty'),
    CLOUDINARY_API_SECRET: optionalString('must not be empty'),
  })
  .superRefine((value, ctx) => {
    const usesDatabaseUrl = isPresent(value.DATABASE_URL)

    if (value.NODE_ENV === 'production') {
      if (!isPresent(value.CLIENT_URL)) {
        ctx.addIssue({
          code: 'custom',
          path: ['CLIENT_URL'],
          message: 'is required in production',
        })
      }

      if (!isPresent(value.REDIS_URL)) {
        ctx.addIssue({
          code: 'custom',
          path: ['REDIS_URL'],
          message: 'is required in production',
        })
      }
    }

    // Tests always run against `${DB_NAME}_test`, even when DATABASE_URL is set.
    if (
      (!usesDatabaseUrl || value.NODE_ENV === 'test') &&
      !isPresent(value.DB_NAME)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['DB_NAME'],
        message:
          value.NODE_ENV === 'test'
            ? 'is required for the test environment'
            : 'is required when DATABASE_URL is not set',
      })
    }

    if (!usesDatabaseUrl && !isPresent(value.DB_USER)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DB_USER'],
        message: 'is required when DATABASE_URL is not set',
      })
    }

    const cloudinary = [
      ['CLOUDINARY_CLOUD_NAME', value.CLOUDINARY_CLOUD_NAME],
      ['CLOUDINARY_API_KEY', value.CLOUDINARY_API_KEY],
      ['CLOUDINARY_API_SECRET', value.CLOUDINARY_API_SECRET],
    ]
    const configured = cloudinary.filter(([, item]) => isPresent(item))

    if (configured.length > 0 && configured.length < cloudinary.length) {
      for (const [name, item] of cloudinary) {
        if (!isPresent(item)) {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'is required when any Cloudinary variable is set',
          })
        }
      }
    }
  })

const result = schema.safeParse(process.env)

if (!result.success) {
  const details = result.error.issues.map((issue) => {
    const name = issue.path.join('.') || 'environment'
    return `  - ${name}: ${issue.message}`
  })
  const error = new Error(
    ['Invalid environment configuration:', ...details].join('\n'),
  )
  error.name = 'EnvironmentValidationError'
  throw error
}

const parsed = result.data

module.exports = {
  NODE_ENV: parsed.NODE_ENV,
  PORT: parsed.PORT,
  TRUST_PROXY: parsed.TRUST_PROXY,
  CLIENT_URL: parsed.CLIENT_URL || 'http://localhost:5173',

  DB: {
    host: parsed.DB_HOST,
    port: parsed.DB_PORT,
    name: parsed.DB_NAME || '',
    user: parsed.DB_USER || '',
    password: parsed.DB_PASSWORD || '',
    url: parsed.DATABASE_URL || '',
  },

  REDIS_URL: parsed.REDIS_URL || 'redis://localhost:6379',

  // No fallbacks: these stay undefined until authentication is implemented,
  // at which point a startup check must require both secrets.
  JWT: {
    accessSecret: parsed.JWT_ACCESS_SECRET,
    refreshSecret: parsed.JWT_REFRESH_SECRET,
    accessExpiresIn: parsed.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: parsed.JWT_REFRESH_EXPIRES_IN,
  },

  SESSION_SECRET: parsed.SESSION_SECRET,

  CLOUDINARY: {
    cloudName: parsed.CLOUDINARY_CLOUD_NAME || '',
    apiKey: parsed.CLOUDINARY_API_KEY || '',
    apiSecret: parsed.CLOUDINARY_API_SECRET || '',
  },
}
