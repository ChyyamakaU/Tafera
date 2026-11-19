'use strict'

process.env.NODE_ENV = 'test'

const { test, mock } = require('node:test')
const assert = require('node:assert/strict')

const { createResendTransport } = require('../src/services/resendTransport')
const { EmailDeliveryUnavailableError } = require('../src/utils/emailErrors')

test('createResendTransport returns a transport with a send method', (t) => {
  const transport = createResendTransport({
    apiKey: 're_test_key_1234567890abcdef',
    from: 'Tafera <noreply@example.com>',
  })
  assert.ok(transport)
  assert.equal(typeof transport.send, 'function')
})

test('send passes through to, subject, text and html to Resend', async (t) => {
  const sentParams = []
  const MockResend = class {
    constructor(apiKey) {
      this.apiKey = apiKey
      this.emails = {
        send: mock.fn(async (params) => {
          sentParams.push(params)
          return { data: { id: 'test-email-id' }, error: null }
        }),
      }
    }
  }

  const transport = createResendTransport({
    apiKey: 're_test_key_1234567890abcdef',
    from: 'Tafera <noreply@example.com>',
    Resend: MockResend,
  })

  await transport.send({
    to: 'user@example.com',
    subject: 'Verify your Tafera email address',
    text: 'Verify link: http://localhost:5173/verify-email?token=abc123',
    html: '<p>Verify link</p>',
  })

  assert.equal(sentParams.length, 1)
  assert.equal(sentParams[0].from, 'Tafera <noreply@example.com>')
  assert.equal(sentParams[0].to, 'user@example.com')
  assert.equal(sentParams[0].subject, 'Verify your Tafera email address')
  assert.equal(
    sentParams[0].text,
    'Verify link: http://localhost:5173/verify-email?token=abc123',
  )
  assert.equal(sentParams[0].html, '<p>Verify link</p>')
})

test('send does not expose the API key in the payload', async (t) => {
  const sentParams = []
  const MockResend = class {
    constructor(apiKey) {
      this.apiKey = apiKey
      this.emails = {
        send: mock.fn(async (params) => {
          sentParams.push(params)
          return { data: { id: 'test-email-id' }, error: null }
        }),
      }
    }
  }

  const transport = createResendTransport({
    apiKey: 're_secret_key_1234567890',
    from: 'noreply@example.com',
    Resend: MockResend,
  })

  await transport.send({
    to: 'user@example.com',
    subject: 'Test',
    text: 'Hi',
    html: '<p>Hi</p>',
  })

  assert.equal(sentParams.length, 1)
  assert.equal(sentParams[0].from, 'noreply@example.com')
  assert.ok(!Object.prototype.hasOwnProperty.call(sentParams[0], 'apiKey'))
  assert.equal(JSON.stringify(sentParams[0]).indexOf('re_secret_key'), -1)
})

test('Resend errors are converted to EmailDeliveryUnavailableError without leaking details', async (t) => {
  const MockResend = class {
    constructor(apiKey) {
      this.apiKey = apiKey
      this.emails = {
        send: mock.fn(async () => {
          const err = new Error('Provider rejected message')
          err.statusCode = 400
          return { data: null, error: err }
        }),
      }
    }
  }

  const transport = createResendTransport({
    apiKey: 're_test_key_1234567890abcdef',
    from: 'noreply@example.com',
    Resend: MockResend,
  })

  await assert.rejects(
    transport.send({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hi',
      html: '<p>Hi</p>',
    }),
    (error) => {
      assert.ok(error instanceof EmailDeliveryUnavailableError)
      assert.equal(error.status, 503)
      assert.equal(error.code, 'EMAIL_DELIVERY_UNAVAILABLE')
      assert.equal(error.message.includes('re_test_key'), false)
      assert.equal(error.message.includes('Provider rejected'), false)
      assert.equal(error.message.includes('user@example.com'), false)
      return true
    },
  )
})

test('successful send returns Resend data', async (t) => {
  const MockResend = class {
    constructor(apiKey) {
      this.apiKey = apiKey
      this.emails = {
        send: mock.fn(async () => ({
          data: { id: 'resend-email-id-123' },
          error: null,
        })),
      }
    }
  }

  const transport = createResendTransport({
    apiKey: 're_test_key_1234567890abcdef',
    from: 'noreply@example.com',
    Resend: MockResend,
  })

  const result = await transport.send({
    to: 'user@example.com',
    subject: 'Test',
    text: 'Hi',
    html: '<p>Hi</p>',
  })

  assert.equal(result.id, 'resend-email-id-123')
})
