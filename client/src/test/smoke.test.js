import { describe, it, expect } from 'vitest'

describe('smoke test', () => {
  it('test environment is working', () => {
    expect(1 + 1).toBe(2)
  })

  it('jsdom environment is available', () => {
    expect(document).toBeDefined()
    expect(window).toBeDefined()
  })

  it('jest-dom matchers are available', () => {
    const element = document.createElement('div')
    element.textContent = 'hello'
    expect(element).toHaveTextContent('hello')
  })
})
