// src/modules/circuit-breaker/anomaly.ts
// CostGuard — Z-score anomaly detection for spend spike identification
export interface AnomalyResult {
  isAnomaly: boolean
  zScore: number
  confidence: number // 0-100
}

export function detectAnomaly(
  historicalReadings: number[],
  currentRate: number,
  threshold = 3.0
): AnomalyResult {
  const n = historicalReadings.length
  if (n < 10) return { isAnomaly: false, zScore: 0, confidence: 0 }

  const mean = historicalReadings.reduce((a, b) => a + b, 0) / n

  const variance =
    historicalReadings.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n
  const stdDev = Math.sqrt(variance)

  if (stdDev === 0) return { isAnomaly: false, zScore: 0, confidence: 0 }

  const zScore = (currentRate - mean) / stdDev
  const confidence = Math.min(100, Math.round((Math.abs(zScore) / 3) * 100))

  return {
    isAnomaly: zScore > threshold,
    zScore: Math.round(zScore * 100) / 100,
    confidence,
  }
}
