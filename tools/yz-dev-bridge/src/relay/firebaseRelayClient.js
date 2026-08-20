const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class RelayHttpError extends Error {
  constructor(status, code, message, retryable = false) {
    super(message);
    this.name = 'RelayHttpError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FirebaseRelayClient {
  constructor({ apiUrl, token, agentId, fetchImpl = fetch, retries = 3 }) {
    this.apiUrl = String(apiUrl || '').replace(/\/$/, '');
    this.token = token;
    this.agentId = agentId || 'local-yz-dev-bridge';
    this.fetchImpl = fetchImpl;
    this.retries = retries;
  }

  async request(method, path, body) {
    const url = `${this.apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = {
      authorization: `Bearer ${this.token}`,
      'x-yz-bridge-agent': this.agentId,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok) {
      const message = json?.error || `HTTP ${response.status}`;
      throw new RelayHttpError(
        response.status,
        json?.code || 'http_error',
        message,
        RETRYABLE_STATUS.has(response.status),
      );
    }
    return json;
  }

  async requestWithRetry(method, path, body) {
    let lastError;
    for (let attempt = 0; attempt < this.retries; attempt += 1) {
      try {
        return await this.request(method, path, body);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof RelayHttpError ? error.retryable : true;
        if (!retryable || attempt === this.retries - 1) throw error;
        await sleep(200 * (2 ** attempt));
      }
    }
    throw lastError;
  }

  status() {
    return this.requestWithRetry('GET', '/status');
  }

  listTasks(query = {}) {
    const params = new URLSearchParams();
    if (query.project) params.set('project', query.project);
    if (query.status) params.set('status', query.status);
    if (query.claimedBy) params.set('claimedBy', query.claimedBy);
    if (query.limit) params.set('limit', String(query.limit));
    const suffix = params.toString() ? `?${params}` : '';
    return this.requestWithRetry('GET', `/tasks${suffix}`);
  }

  getTask(id) {
    return this.requestWithRetry('GET', `/task?id=${encodeURIComponent(id)}`);
  }

  createTask(payload) {
    return this.requestWithRetry('POST', '/tasks', payload);
  }

  claimTask(id, actor) {
    return this.requestWithRetry('POST', `/task/${encodeURIComponent(id)}/claim`, { actor, agentId: actor });
  }

  updateStatus(id, payload) {
    return this.requestWithRetry('POST', `/task/${encodeURIComponent(id)}/status`, payload);
  }

  writeResult(id, payload) {
    return this.requestWithRetry('POST', `/task/${encodeURIComponent(id)}/result`, payload);
  }
}
