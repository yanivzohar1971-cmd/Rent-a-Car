import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Durable per-project writer lease. One active writer per project by default.
 * Stored outside production Bridge Store task docs so V1 schema stays intact.
 */
export class ProjectLeaseManager {
  constructor({
    filePath,
    staleMs = 15 * 60 * 1000,
    pidAliveImpl = defaultPidAlive,
  } = {}) {
    if (!filePath) throw new Error('ProjectLeaseManager requires filePath');
    this.filePath = resolve(filePath);
    this.staleMs = staleMs;
    this.pidAliveImpl = pidAliveImpl;
  }

  read() {
    if (!existsSync(this.filePath)) {
      return { schemaVersion: 1, leases: {} };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return { schemaVersion: 1, leases: {} };
      return {
        schemaVersion: 1,
        leases: parsed.leases && typeof parsed.leases === 'object' ? parsed.leases : {},
      };
    } catch {
      // Fail closed on corrupt lease file — do not wipe.
      throw new Error(`Project lease file unreadable/corrupt: ${this.filePath}`);
    }
  }

  write(data) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    try {
      renameSync(tmp, this.filePath);
    } catch (error) {
      try { unlinkSync(tmp); } catch { /* ignore */ }
      throw error;
    }
  }

  getLease(projectId) {
    const id = String(projectId || '').trim();
    if (!id) return null;
    return this.read().leases[id] || null;
  }

  /**
   * Acquire writer lease. Returns { acquired, lease, reason }.
   */
  acquire({
    projectId,
    taskId,
    executionId,
    provider,
    ownerPid = process.pid,
    ownerIdentity = null,
    now = Date.now(),
  } = {}) {
    const id = String(projectId || '').trim();
    if (!id) throw new Error('projectId required for lease');
    const data = this.read();
    const existing = data.leases[id] || null;

    if (existing) {
      const reconciled = this.#reconcileOne(existing, now);
      if (reconciled.keep) {
        if (reconciled.lease.taskId === taskId && reconciled.lease.executionId === executionId) {
          const lease = {
            ...reconciled.lease,
            heartbeatAt: new Date(now).toISOString(),
          };
          data.leases[id] = lease;
          this.write(data);
          return { acquired: true, lease, reason: 'reentrant' };
        }
        return {
          acquired: false,
          lease: reconciled.lease,
          reason: 'PROJECT_LEASE_HELD',
        };
      }
      // stale — drop
      delete data.leases[id];
    }

    const lease = {
      projectId: id,
      taskId,
      executionId,
      provider: provider || 'legacy',
      acquiredAt: new Date(now).toISOString(),
      heartbeatAt: new Date(now).toISOString(),
      ownerPid: Number(ownerPid) || null,
      ownerIdentity: ownerIdentity || null,
      leaseGeneration: randomUUID().slice(0, 8),
      status: 'HELD',
    };
    data.leases[id] = lease;
    this.write(data);
    return { acquired: true, lease, reason: 'acquired' };
  }

  heartbeat(projectId, { executionId = null, now = Date.now() } = {}) {
    const data = this.read();
    const lease = data.leases[String(projectId)];
    if (!lease) return { ok: false, reason: 'NO_LEASE' };
    if (executionId && lease.executionId !== executionId) {
      return { ok: false, reason: 'EXECUTION_MISMATCH' };
    }
    lease.heartbeatAt = new Date(now).toISOString();
    data.leases[String(projectId)] = lease;
    this.write(data);
    return { ok: true, lease };
  }

  release(projectId, { taskId = null, executionId = null } = {}) {
    const data = this.read();
    const id = String(projectId);
    const lease = data.leases[id];
    if (!lease) return { released: false, reason: 'NO_LEASE' };
    if (taskId && lease.taskId !== taskId) {
      return { released: false, reason: 'TASK_MISMATCH' };
    }
    if (executionId && lease.executionId !== executionId) {
      return { released: false, reason: 'EXECUTION_MISMATCH' };
    }
    delete data.leases[id];
    this.write(data);
    return { released: true, reason: 'released' };
  }

  reconcile({ now = Date.now() } = {}) {
    const data = this.read();
    let changed = false;
    for (const [id, lease] of Object.entries(data.leases)) {
      const result = this.#reconcileOne(lease, now);
      if (!result.keep) {
        delete data.leases[id];
        changed = true;
      }
    }
    if (changed) this.write(data);
    return data;
  }

  #reconcileOne(lease, now) {
    if (!lease) return { keep: false };
    const hb = Date.parse(lease.heartbeatAt || lease.acquiredAt || 0);
    const age = Number.isFinite(hb) ? now - hb : Number.POSITIVE_INFINITY;
    const pid = Number(lease.ownerPid);
    if (Number.isInteger(pid) && pid > 0 && !this.pidAliveImpl(pid) && age > 5_000) {
      return { keep: false, reason: 'OWNER_PID_DEAD' };
    }
    if (age > this.staleMs) {
      return { keep: false, reason: 'STALE_TIMEOUT' };
    }
    return { keep: true, lease };
  }
}

function defaultPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
