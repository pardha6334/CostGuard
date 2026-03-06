// src/modules/circuit-breaker/state-machine.ts
// CostGuard — Circuit breaker FSM: CLOSED → OPEN → HALF_OPEN → CLOSED
export type CBState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'
export type CBAction = 'MONITOR' | 'KILL' | 'WATCH' | 'CLOSE'

export class CircuitBreaker {
  private state: CBState
  private halfOpenStarted?: Date
  private readonly HALF_OPEN_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

  constructor(initialState: CBState = 'CLOSED') {
    this.state = initialState
  }

  getState(): CBState {
    return this.state
  }

  evaluate(burnRate: number, limit: number): CBAction {
    switch (this.state) {
      case 'CLOSED':
        if (burnRate > limit) {
          this.state = 'OPEN'
          return 'KILL'
        }
        return 'MONITOR'

      case 'OPEN':
        return 'MONITOR' // waiting for manual restore

      case 'HALF_OPEN':
        if (burnRate > limit) {
          this.state = 'OPEN'
          return 'KILL' // spiked again — re-kill
        }
        if (this.halfOpenElapsedMs() > this.HALF_OPEN_WINDOW_MS) {
          this.state = 'CLOSED'
          return 'CLOSE' // stable for 15 min — safe
        }
        return 'WATCH'
    }
  }

  initiateRestore(): void {
    if (this.state !== 'OPEN') return
    this.state = 'HALF_OPEN'
    this.halfOpenStarted = new Date()
  }

  forceClose(): void {
    this.state = 'CLOSED'
    this.halfOpenStarted = undefined
  }

  private halfOpenElapsedMs(): number {
    return this.halfOpenStarted
      ? Date.now() - this.halfOpenStarted.getTime()
      : 0
  }
}
