// src/modules/circuit-breaker/burn-rate.ts
// CostGuard — Sliding window burn rate calculator using circular buffer O(1)
export class SlidingWindowBurnRate {
  private buffer: { amount: number; ts: number }[]
  private head = 0
  private size = 0
  private readonly W = 60 // 60 readings = 60 minutes of history

  constructor() {
    this.buffer = new Array(this.W)
  }

  push(amount: number, timestamp: number = Date.now()): void {
    this.buffer[this.head] = { amount, ts: timestamp }
    this.head = (this.head + 1) % this.W
    this.size = Math.min(this.size + 1, this.W)
  }

  getBurnRatePerHour(): number {
    if (this.size < 2) return 0
    const oldest = this.buffer[(this.head - this.size + this.W) % this.W]
    const newest = this.buffer[(this.head - 1 + this.W) % this.W]
    const deltaAmt = newest.amount - oldest.amount
    const deltaHrs = (newest.ts - oldest.ts) / 3_600_000
    return deltaHrs > 0 ? deltaAmt / deltaHrs : 0
  }

  getReadings(): number[] {
    return Array.from({ length: this.size }, (_, i) =>
      this.buffer[(this.head - this.size + i + this.W) % this.W].amount
    )
  }

  getSize(): number {
    return this.size
  }

  reset(): void {
    this.head = 0
    this.size = 0
    this.buffer = new Array(this.W)
  }
}
