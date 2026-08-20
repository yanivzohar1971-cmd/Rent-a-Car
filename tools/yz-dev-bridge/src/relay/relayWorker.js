import { RelayHttpError } from './firebaseRelayClient.js';
import { mapFirebaseTaskToLocalInput, mapLocalStatusToFirebase, shouldPublishResult } from './taskMapper.js';

function logInfo(logger, message, extra) {
  if (extra) logger.info ? logger.info(message, extra) : logger.error(`${message} ${JSON.stringify(extra)}`);
  else logger.error(message);
}

export class RelayWorker {
  constructor({ client, store, config, logger = console }) {
    this.client = client;
    this.store = store;
    this.config = config;
    this.logger = logger;
    this.timer = null;
    this.running = false;
    this.tickInFlight = false;
  }

  async recoverClaimedTasks() {
    const response = await this.client.listTasks({
      project: this.config.project,
      claimedBy: this.config.agentId,
      limit: 50,
    });
    const tasks = response.tasks || [];
    for (const remote of tasks) {
      if (remote.status !== 'CLAIMED' && remote.status !== 'RUNNING') continue;
      await this.store.importFirebaseTask(mapFirebaseTaskToLocalInput(remote));
    }
  }

  async ingestQueuedTasks() {
    const response = await this.client.listTasks({
      project: this.config.project,
      status: 'QUEUED',
      limit: 20,
    });
    const queued = response.tasks || [];
    for (const remote of queued) {
      try {
        const claimed = await this.client.claimTask(remote.id, this.config.agentId);
        const firebaseTask = claimed.task || remote;
        const imported = await this.store.importFirebaseTask(mapFirebaseTaskToLocalInput(firebaseTask));
        logInfo(this.logger, `YZ relay ingested Firebase task ${firebaseTask.id} as ${imported.task.id} created=${imported.created}`);
      } catch (error) {
        if (error instanceof RelayHttpError && error.status === 409) {
          logInfo(this.logger, `YZ relay skipped already-claimed task ${remote.id}`);
          continue;
        }
        throw error;
      }
    }
  }

  async syncLocalProgress() {
    const localTasks = await this.store.listFirebaseRelayTasks();
    for (const local of localTasks) {
      const firebaseId = local.metadata.firebaseTaskId;
      const mapped = mapLocalStatusToFirebase(local);

      if (local.status === 'IN_PROGRESS' && !local.metadata.relayPublishedAt) {
        try {
          await this.client.updateStatus(firebaseId, { status: 'RUNNING', actor: this.config.agentId });
        } catch (error) {
          if (!(error instanceof RelayHttpError && error.status === 409)) throw error;
        }
      }

      if (shouldPublishResult(local)) {
        await this.client.writeResult(firebaseId, {
          status: mapped,
          resultSummary: local.summary,
          changedFiles: local.changedFiles,
          tests: local.tests,
          error: local.metadata?.error || (mapped === 'FAILED' ? local.summary : null),
          actor: this.config.agentId,
        });
        await this.store.markRelayPublished({ id: local.id, firebaseStatus: mapped });
        logInfo(this.logger, `YZ relay published ${local.id} -> Firebase ${firebaseId} as ${mapped}`);
      }
    }
  }

  async tick() {
    await this.recoverClaimedTasks();
    await this.ingestQueuedTasks();
    await this.syncLocalProgress();
  }

  async start() {
    if (this.running) return;
    this.running = true;
    logInfo(this.logger, `YZ Dev Bridge Firebase relay starting for project ${this.config.project}`);
    const loop = async () => {
      if (!this.running || this.tickInFlight) return;
      this.tickInFlight = true;
      try {
        await this.tick();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logInfo(this.logger, `YZ relay tick failed: ${message}`);
      } finally {
        this.tickInFlight = false;
      }
    };
    await loop();
    this.timer = setInterval(loop, this.config.intervalMs);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
