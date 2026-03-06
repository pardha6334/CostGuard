// tests/unit/burn-rate.test.ts
// CostGuard — Unit tests for SlidingWindowBurnRate
import { describe, it, expect, beforeEach } from 'vitest'
import { SlidingWindowBurnRate } from '@/modules/circuit-breaker/burn-rate'

describe('SlidingWindowBurnRate', () => {
  let calc: SlidingWindowBurnRate

  beforeEach(() => {
    calc = new SlidingWindowBurnRate()
  })

  it('returns 0 with 0 readings', () => {
    expect(calc.getBurnRatePerHour()).toBe(0)
  })

  it('returns 0 with only 1 reading', () => {
    calc.push(10, Date.now())
    expect(calc.getBurnRatePerHour()).toBe(0)
  })

  it('calculates $10/hr correctly', () => {
    const base = Date.now()
    calc.push(0, base)
    calc.push(10, base + 3_600_000) // exactly 1 hour later, spent $10
    expect(calc.getBurnRatePerHour()).toBeCloseTo(10, 1)
  })

  it('calculates $200/hr correctly', () => {
    const base = Date.now()
    calc.push(0, base)
    calc.push(200, base + 3_600_000)
    expect(calc.getBurnRatePerHour()).toBeCloseTo(200, 1)
  })

  it('returns 0 when amount does not increase', () => {
    const base = Date.now()
    calc.push(50, base)
    calc.push(50, base + 3_600_000)
    expect(calc.getBurnRatePerHour()).toBe(0)
  })

  it('handles circular buffer overflow — 70 items into 60-slot buffer', () => {
    const base = Date.now()
    for (let i = 0; i < 70; i++) {
      calc.push(i * 10, base + i * 60_000)
    }
    expect(calc.getSize()).toBe(60)
    expect(calc.getBurnRatePerHour()).toBeGreaterThan(0)
  })

  it('getReadings returns all values in insertion order', () => {
    const base = Date.now()
    calc.push(100, base)
    calc.push(200, base + 60_000)
    calc.push(300, base + 120_000)
    const readings = calc.getReadings()
    expect(readings).toEqual([100, 200, 300])
  })

  it('reset clears all state', () => {
    const base = Date.now()
    calc.push(0, base)
    calc.push(100, base + 3_600_000)
    calc.reset()
    expect(calc.getSize()).toBe(0)
    expect(calc.getBurnRatePerHour()).toBe(0)
  })
})
