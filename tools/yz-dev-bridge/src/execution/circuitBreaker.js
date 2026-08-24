/**
 * Simple provider circuit breaker — prevents unbounded SDK start loops.
 */
export const CIRCUIT = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  OPEN: 'OPEN',
  PROBING: 'PROBING',
});

export class ProviderCircuitBreaker {
  constructor({
    failureThreshold = 3,
    openMs = 60_000,
    providerId = 'unknown',
  } = {}) {
    this.failureThreshold = failureThreshold;
    this.openMs = openMs;
    this.providerId = providerId;
    this.failures = 0;
    this.state = CIRCUIT.HEALTHY;
    this.openedAt = null;
    this.lastError = null;
  }

  canStart({ now = Date.now() } = {}) {
    if (this.state === CIRCUIT.OPEN) {
      if (this.openedAt && now - this.openedAt >= this.openMs) {
        this.state = CIRCUIT.PROBING;
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.failures = 0;
    this.state = CIRCUIT.HEALTHY;
    this.openedAt = null;
    this.lastError = null;
  }

  recordFailure(error, { now = Date.now() } = {}) {
    this.failures += 1;
    this.lastError = error instanceof Error ? error.message : String(error);
    if (this.failures >= this.failureThreshold) {
      this.state = CIRCUIT.OPEN;
      this.openedAt = now;
    } else if (this.failures > 0) {
      this.state = CIRCUIT.DEGRADED;
    }
  }

  snapshot() {
    return {
      providerId: this.providerId,
      state: this.state,
      failures: this.failures,
      openedAt: this.openedAt,
      lastError: this.lastError,
    };
  }
}
