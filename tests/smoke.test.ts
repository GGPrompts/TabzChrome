import { describe, it, expect } from 'vitest'

/**
 * Smoke test to verify test infrastructure is working
 * Delete this file once real tests are added
 */

describe('Test Infrastructure', () => {
  it('should run tests successfully', () => {
    expect(true).toBe(true)
  })

  it('should have access to globals', () => {
    expect(describe).toBeDefined()
    expect(it).toBeDefined()
    expect(expect).toBeDefined()
  })

  it('should have mocked WebSocket', () => {
    const ws = new WebSocket('ws://localhost:8127')
    expect(ws).toBeDefined()
    expect(ws.readyState).toBeDefined()
  })

  it('should have mocked localStorage', () => {
    localStorage.setItem('test', 'value')
    expect(localStorage.getItem('test')).toBe('value')
    localStorage.clear()
  })

  it('should have mocked ResizeObserver', () => {
    const observer = new ResizeObserver(() => {})
    expect(observer).toBeDefined()
    expect(observer.observe).toBeDefined()
  })
})
