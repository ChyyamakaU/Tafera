'use strict'

process.env.NODE_ENV = 'test'

const { test, mock } = require('node:test')
const assert = require('node:assert/strict')

const { createBrevoTransport } = require('../src/services/brevoTransport')
const { EmailDeliveryUnavailableError } = require('../src/utils/emailErrors')

test('createBrevoTransport returns a transport with a send method', (t) => {
  const transport = createBrevoTransport({
    apiKey: 'brevo_test_key_1234567890abcdef',
    from: 'noreply@example.com',
  })
  assert.ok(transport)
  assert.equal(typeof transport.send, 'function')
})

test('send passes through to, subject, text and html to Brevo', async (t) => {
  const sentParams = []
  const globalFetch = global.fetch
  global.fetch = mock.fn(async (url, options) => {
    sentParams.push({ url, options })
    return {
      ok: true,
      json: async () => ({ data: { messageId: 'test-email-id' } }),
    }
  })

  try {
    const transport = createBrevoTransport({
      apiKey: 'brevo_test_key_1234567890abcdef',
      from: 'noreply@example.com',
    })

    await transport.send({
      to: 'user@example.com',
      subject: 'Verify your Tafera email address',
      text: 'Verify link: http://localhost:5173/verify-email?token=abc123',
      html: '<p>Verify link</p>',
    })

    assert.equal(sentParams.length, 1)
    assert.equal(sentParams[0].url, 'https://api.brevo.com/v3/smtp/email')
    assert.equal(sentParams[0].options.method, 'POST')
    const body = JSON.parse(sentParams[0].options.body)
    assert.equal(body.sender.email, 'noreply@example.com')
    assert.equal(body.to[0].email, 'user@example.com')
    assert.equal(body.subject, 'Verify your Tafera email address')
    assert.equal(body.textContent, 'Verify link: http://localhost:5173/verify-email?token=abc123')
    assert.equal(body.htmlContent, '<p>Verify link</p>')

    const headers = sentParams[0].options.headers
    assert.equal(headers['api-key'], 'brevo_test_key_1234567890abcdef')
    assert.equal(headers['Content-Type'], 'application/json')
  } finally {
    global.fetch = globalFetch
  }
})

test('send does not expose the API key in the body', async (t) => {
  const sentBodies = []
  const globalFetch = global.fetch
  global.fetch = mock.fn(async (url, options) => {
    sentBodies.push(JSON.parse(options.body))
    return {
      ok: true,
      json: async () => ({ data: { messageId: 'test-email-id' } }),
    }
  })

  try {
    const transport = createBrevoTransport({
      apiKey: 'brevo_secret_key_1234567890',
      from: 'noreply@example.com',
    })

    await transport.send({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hi',
      html: '<p>Hi</p>',
    })

    assert.equal(sentBodies.length, 1)
    assert.ok(!JSON.stringify(sentBodies[0]).includes('brevo_secret_key'))
  } finally {
    global.fetch = globalFetch
  }
})

test('Brevo errors are converted to EmailDeliveryUnavailableError without leaking details', async (t) => {
  const globalFetch = global.fetch
  global.fetch = mock.fn(async () => {
    return {
      ok: false,
      status: 400,
      json: async () => ({ code: 'invalid_parameter', message: 'Provider rejected message' }),
    }
  })

  try {
    const transport = createBrevoTransport({
      apiKey: 'brevo_test_key_1234567890abcdef',
      from: 'noreply@example.com',
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
        assert.equal(error.message.includes('brevo_test_key'), false)
        assert.equal(error.message.includes('Provider rejected'), false)
        assert.equal(error.message.includes('user@example.com'), false)
        return true
      },
    )
  } finally {
    global.fetch = globalFetch
  }
})

test('successful send returns Brevo data', async (t) => {
  const globalFetch = global.fetch
  global.fetch = mock.fn(async () => {
    return {
      ok: true,
      json: async () => ({ messageId: 'brevo-email-id-123' }),
    }
  })

  try {
    const transport = createBrevoTransport({
      apiKey: 'brevo_test_key_1234567890abcdef',
      from: 'noreply@example.com',
    })

    const result = await transport.send({
      to: 'user@example.com',
      subject: 'Test',
      text: 'Hi',
      html: '<p>Hi</p>',
    })

    assert.equal(result.messageId, 'brevo-email-id-123')
  } finally {
    global.fetch = globalFetch
  }
})
