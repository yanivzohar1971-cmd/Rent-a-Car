export const VERIFICATION_STATES = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  RUNNING: 'RUNNING',
  PASS: 'PASS',
  FAIL: 'FAIL',
  FLAKY: 'FLAKY',
  BLOCKED: 'BLOCKED',
});

/**
 * Normalized verification pipeline result.
 * Flaky core checks must not be accepted as PASS.
 */
export function createVerificationState() {
  return {
    state: VERIFICATION_STATES.NOT_STARTED,
    startedAt: null,
    completedAt: null,
    checks: [],
    artifacts: [],
  };
}

export function classifyVerification(checks = [], { allowFlakyPass = false } = {}) {
  if (!checks.length) {
    return { state: VERIFICATION_STATES.NOT_STARTED, checks };
  }
  if (checks.some((c) => c.state === VERIFICATION_STATES.BLOCKED)) {
    return { state: VERIFICATION_STATES.BLOCKED, checks };
  }
  if (checks.some((c) => c.state === VERIFICATION_STATES.RUNNING)) {
    return { state: VERIFICATION_STATES.RUNNING, checks };
  }
  if (checks.some((c) => c.state === VERIFICATION_STATES.FAIL)) {
    return { state: VERIFICATION_STATES.FAIL, checks };
  }
  const flaky = checks.filter((c) => c.state === VERIFICATION_STATES.FLAKY);
  if (flaky.length && !allowFlakyPass) {
    return { state: VERIFICATION_STATES.FLAKY, checks };
  }
  if (checks.every((c) => c.state === VERIFICATION_STATES.PASS || (allowFlakyPass && c.state === VERIFICATION_STATES.FLAKY))) {
    return { state: VERIFICATION_STATES.PASS, checks };
  }
  return { state: VERIFICATION_STATES.FAIL, checks };
}

export async function runVerificationPipeline(runners = [], { now = () => new Date().toISOString() } = {}) {
  const startedAt = now();
  const checks = [];
  for (const runner of runners) {
    const started = now();
    let result;
    try {
      result = await runner.run();
    } catch (error) {
      result = {
        state: VERIFICATION_STATES.FAIL,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    checks.push({
      id: runner.id,
      command: runner.command || null,
      state: result.state || VERIFICATION_STATES.FAIL,
      startedAt: started,
      completedAt: now(),
      detail: result.detail || null,
      attempts: Number(result.attempts) || 1,
    });
  }
  const classified = classifyVerification(checks);
  return {
    ...classified,
    startedAt,
    completedAt: now(),
    artifacts: [],
  };
}
