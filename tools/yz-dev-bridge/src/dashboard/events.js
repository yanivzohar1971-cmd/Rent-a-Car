const DEFAULT_LIMIT = 200;

export class EventHub {
  constructor({ limit = DEFAULT_LIMIT, heartbeatMs = 15_000 } = {}) {
    this.limit = Math.max(10, Math.min(Number(limit) || DEFAULT_LIMIT, 1000));
    this.heartbeatMs = Math.max(1000, Number(heartbeatMs) || 15_000);
    this.clients = new Set();
    this.history = [];
    this.sequence = 0;
    this.heartbeatTimer = null;
  }

  start() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.emit('heartbeat', { at: new Date().toISOString() });
    }, this.heartbeatMs);
    if (typeof this.heartbeatTimer.unref === 'function') this.heartbeatTimer.unref();
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const client of [...this.clients]) {
      this.disconnect(client);
    }
  }

  emit(type, payload = {}) {
    this.sequence += 1;
    const event = {
      id: this.sequence,
      type: String(type || 'message'),
      at: payload.at || new Date().toISOString(),
      payload,
    };
    if (event.type !== 'heartbeat' && event.type !== 'snapshot') {
      this.history.push(event);
      if (this.history.length > this.limit) {
        this.history.splice(0, this.history.length - this.limit);
      }
    }
    const frame = formatSse(event);
    for (const client of [...this.clients]) {
      try {
        client.res.write(frame);
      } catch {
        this.disconnect(client);
      }
    }
    return event;
  }

  recent({ limit = 50 } = {}) {
    const safe = Math.max(1, Math.min(Number(limit) || 50, this.limit));
    return this.history.slice(-safe);
  }

  subscribe(res, { snapshot = null } = {}) {
    const client = { res, connectedAt: Date.now() };
    this.clients.add(client);
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write(': connected\n\n');
    res.write(formatSse({
      id: this.sequence,
      type: 'heartbeat',
      at: new Date().toISOString(),
      payload: { at: new Date().toISOString() },
    }));
    if (snapshot) {
      res.write(formatSse({
        id: this.sequence,
        type: 'snapshot',
        at: new Date().toISOString(),
        payload: snapshot,
      }));
    }
    const onClose = () => this.disconnect(client);
    res.on('close', onClose);
    res.on('error', onClose);
    return client;
  }

  push(client, type, payload = {}) {
    if (!this.clients.has(client)) return false;
    try {
      this.sequence += 1;
      client.res.write(formatSse({
        id: this.sequence,
        type,
        at: new Date().toISOString(),
        payload,
      }));
      return true;
    } catch {
      this.disconnect(client);
      return false;
    }
  }

  disconnect(client) {
    if (!this.clients.has(client)) return false;
    this.clients.delete(client);
    try {
      client.res.end();
    } catch {
      // already closed
    }
    return true;
  }

  get clientCount() {
    return this.clients.size;
  }
}

export function formatSse(event) {
  const type = String(event.type || 'message');
  const id = event.id != null ? String(event.id) : '';
  const data = JSON.stringify({
    type,
    at: event.at,
    ...event.payload,
  });
  return `${id ? `id: ${id}\n` : ''}event: ${type}\ndata: ${data}\n\n`;
}

export function parseSseBuffer(buffer) {
  const text = String(buffer || '');
  const chunks = text.split('\n\n').filter((chunk) => chunk.trim());
  const events = [];
  for (const chunk of chunks) {
    const event = { type: 'message', data: '', id: null };
    for (const line of chunk.split(/\r?\n/)) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event.type = line.slice(6).trim();
      else if (line.startsWith('data:')) event.data += line.slice(5).trim();
      else if (line.startsWith('id:')) event.id = line.slice(3).trim();
    }
    if (event.data) {
      try {
        event.payload = JSON.parse(event.data);
      } catch {
        event.payload = event.data;
      }
      events.push(event);
    }
  }
  return events;
}
