// tests/unit/state-machine.test.ts
// CostGuard — Unit tests for CircuitBreaker FSM
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CircuitBreaker } from '@/modules/circuit-breaker/state-machine'

describe('CircuitBreaker FSM', () => {
  let cb: CircuitBreaker

  beforeEach(() => {
    cb = new CircuitBreaker('CLOSED')
  })

  it('starts CLOSED', () => {
    expect(cb.getState()).toBe('CLOSED')
  })

  it('CLOSED + burn < limit → MONITOR, stays CLOSED', () => {
    const action = cb.evaluate(50, 200)
    expect(action).toBe('MONITOR')
    expect(cb.getState()).toBe('CLOSED')
  })

  it('CLOSED + burn > limit → KILL, moves to OPEN', () => {
    const action = cb.evaluate(250, 200)
    expect(action).toBe('KILL')
    expect(cb.getState()).toBe('OPEN')
  })

  it('OPEN → always returns MONITOR regardless of burn rate', () => {
    cb.evaluate(250, 200) // → OPEN
    expect(cb.evaluate(500, 200)).toBe('MONITOR')
    expect(cb.evaluate(10, 200)).toBe('MONITOR')
    expect(cb.getState()).toBe('OPEN')
  })

  it('initiateRestore moves OPEN → HALF_OPEN', () => {
    cb.evaluate(250, 200) // → OPEN
    cb.initiateRestore()
    expect(cb.getState()).toBe('HALF_OPEN')
  })

  it('initiateRestore does nothing if not OPEN', () => {
    cb.initiateRestore() // still CLOSED
    expect(cb.getState()).toBe('CLOSED')
  })

  it('HALF_OPEN + spike → KILL, back to OPEN', () => {
    cb.evaluate(250, 200) // CLOSED → OPEN
    cb.initiateRestore()   // OPEN → HALF_OPEN
    const action = cb.evaluate(300, 200) // spike again
    expect(action).toBe('KILL')
    expect(cb.getState()).toBe('OPEN')
  })

  it('HALF_OPEN + stable burn → WATCH while within window', () => {
    cb.evaluate(250, 200)
    cb.initiateRestore()
    const action = cb.evaluate(50, 200) // safe, but window not elapsed
    expect(action).toBe('WATCH')
    expect(cb.getState()).toBe('HALF_OPEN')
  })

  it('HALF_OPEN + stable + window elapsed → CLOSE, back to CLOSED', () => {
    cb.evaluate(250, 200)
    cb.initiateRestore()
    // Fast-forward time past 15 minutes
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60 * 1000)
    const action = cb.evaluate(50, 200)
    expect(action).toBe('CLOSE')
    expect(cb.getState()).toBe('CLOSED')
    vi.restoreAllMocks()
  })

  it('forceClose resets to CLOSED from any state', () => {
    cb.evaluate(250, 200) // → OPEN
    cb.forceClose()
    expect(cb.getState()).toBe('CLOSED')
  })

  it('constructor accepts initial state', () => {
    const openCB = new CircuitBreaker('OPEN')
    expect(openCB.getState()).toBe('OPEN')
  })
})
