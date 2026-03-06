// tests/unit/anomaly.test.ts
// CostGuard — Unit tests for Z-score anomaly detection
import { describe, it, expect } from 'vitest'
import { detectAnomaly } from '@/modules/circuit-breaker/anomaly'

const BASELINE = [10, 12, 11, 10, 13, 11, 12, 10, 11, 12] // mean≈11.2, σ≈1.0

describe('detectAnomaly', () => {
  it('returns isAnomaly:false with fewer than 10 readings', () => {
    const result = detectAnomaly([1, 2, 3], 100)
    expect(result.isAnomaly).toBe(false)
    expect(result.zScore).toBe(0)
    expect(result.confidence).toBe(0)
  })

  it('returns isAnomaly:false for normal rate within baseline', () => {
    const result = detectAnomaly(BASELINE, 12) // z ≈ 0.7
    expect(result.isAnomaly).toBe(false)
  })

  it('returns isAnomaly:true for extreme spike (z > 3)', () => {
    const result = detectAnomaly(BASELINE, 50) // z >> 3
    expect(result.isAnomaly).toBe(true)
    expect(result.zScore).toBeGreaterThan(3)
  })

  it('confidence is 100 for extreme spike', () => {
    const result = detectAnomaly(BASELINE, 100)
    expect(result.confidence).toBe(100)
  })

  it('confidence is 0 for < 10 readings', () => {
    expect(detectAnomaly([1,2,3], 999).confidence).toBe(0)
  })

  it('returns isAnomaly:false when all readings identical (stdDev=0)', () => {
    const flatReadings = Array(10).fill(50)
    const result = detectAnomaly(flatReadings, 50)
    expect(result.isAnomaly).toBe(false)
    expect(result.zScore).toBe(0)
  })

  it('zScore is negative when current is below mean', () => {
    const result = detectAnomaly(BASELINE, 5) // below baseline
    expect(result.zScore).toBeLessThan(0)
    expect(result.isAnomaly).toBe(false) // anomaly only for positive spike
  })

  it('respects custom threshold', () => {
    const result = detectAnomaly(BASELINE, 15, 1.0) // z ≈ 3.4, threshold 1.0
    expect(result.isAnomaly).toBe(true)
  })

  it('zScore is rounded to 2 decimal places', () => {
    const result = detectAnomaly(BASELINE, 50)
    const decimals = result.zScore.toString().split('.')[1]?.length ?? 0
    expect(decimals).toBeLessThanOrEqual(2)
  })
})
