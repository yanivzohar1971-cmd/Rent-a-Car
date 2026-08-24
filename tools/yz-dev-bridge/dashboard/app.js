(() => {
  const state = {
    snapshot: null,
    events: [],
    errors: [],
    debug: false,
    startedAt: null,
    connected: false,
    handoff: null,
    sessions: [],
    handoffServiceConfigured: null,
  };

  const $ = (id) => document.getElementById(id);

  function pillClass(value) {
    const key = String(value || 'UNKNOWN').toLowerCase().replace(/\s+/g, '_');
    if (['online', 'completed', 'success', 'green', 'posted', 'closed'].includes(key)) return 'pill green';
    if (['ready', 'waiting', 'amber', 'warn', 'launching', 'pending'].includes(key)) return 'pill amber';
    if (['in_progress', 'active', 'cyan', 'claimed', 'registered', 'open'].includes(key)) return 'pill cyan';
    if (['failed', 'error', 'offline', 'red', 'lost'].includes(key)) return 'pill red';
    if (['blocked', 'degraded', 'orange'].includes(key)) return 'pill orange';
    return 'pill muted';
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString([], { hour12: false });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour12: false })}`;
  }

  function fmtUptime(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function applySnapshot(snapshot) {
    if (!snapshot) return;
    state.snapshot = snapshot;
    if (snapshot.startedAt) state.startedAt = snapshot.startedAt;
    renderAll();
  }

  function mergeState(payload) {
    if (!payload || !state.snapshot) {
      if (payload) applySnapshot(payload);
      return;
    }
    state.snapshot = { ...state.snapshot, ...payload };
    renderAll();
  }

  function pushEvent(item) {
    if (!item) return;
    const entry = {
      at: item.at || new Date().toISOString(),
      type: item.type || 'EVENT',
      taskId: item.taskId || null,
      projectId: item.projectId || null,
      message: item.message || item.type || '',
      new: true,
    };
    state.events.unshift(entry);
    if (state.events.length > 80) state.events.length = 80;
    const infra = /ERROR|RETRY|RECOVERY|FAILURE/i.test(entry.type);
    if (infra) {
      state.errors.unshift(entry);
      if (state.errors.length > 80) state.errors.length = 80;
    }
    renderTimeline();
    renderErrors();
  }

  function renderHeader() {
    const snap = state.snapshot || {};
    const system = snap.systemState || 'UNKNOWN';
    $('system-state').textContent = system;
    $('system-state').className = pillClass(system);
    $('relay-pid').textContent = snap.relay?.pid || '—';
    $('project-count').textContent = String(snap.projects?.length ?? 0);
    $('agent-count').textContent = String(snap.stats?.activeAgents ?? 0);
    $('build-version').textContent = snap.version || '—';
    $('sse-state').textContent = state.connected ? 'LIVE' : 'OFFLINE';
    $('sse-state').className = pillClass(state.connected ? 'ONLINE' : 'OFFLINE');
  }

  function renderKpi() {
    const stats = state.snapshot?.stats || {};
    const items = [
      ['TOTAL TASKS', stats.totalTasks],
      ['READY', stats.READY],
      ['IN PROGRESS', stats.IN_PROGRESS],
      ['COMPLETED', stats.COMPLETED],
      ['FAILED', stats.FAILED],
      ['BLOCKED', stats.BLOCKED],
      ['CANCELLED', stats.CANCELLED],
      ['ACTIVE AGENTS', stats.activeAgents],
      ['ACTIVE PROJECTS', stats.activeProjects],
    ];
    $('kpi').innerHTML = items.map(([label, value]) => `
      <article class="kpi-card">
        <div class="l">${esc(label)}</div>
        <div class="n">${value ?? 0}</div>
      </article>
    `).join('');
  }

  function renderSubsystems() {
    const cards = state.snapshot?.subsystems || [];
    $('subsystems').innerHTML = cards.map((card) => `
      <article class="sys-card">
        <h3>${esc(card.name)}</h3>
        <span class="${pillClass(card.state)}">${esc(card.state || 'UNKNOWN')}</span>
        <div class="sys-meta">
          last ${esc(fmtTime(card.lastActivity))}<br>
          task ${esc(card.activeTask || '—')} · err ${esc(card.errorCount ?? 0)} · q ${esc(card.queueCount ?? 0)}
        </div>
      </article>
    `).join('') || '<p class="idle-state">UNKNOWN</p>';
  }

  function renderLifecycle(task) {
    const phases = task?.lifecycle?.phases || [];
    const current = task?.lifecycle?.current;
    return `<div class="lifecycle">${phases.map((phase, index) => `
      <span class="phase ${phase.proven ? 'proven' : ''} ${phase.id === current ? 'current' : ''}">${esc(phase.label)}</span>
      ${index < phases.length - 1 ? '<span class="arrow">→</span>' : ''}
    `).join('')}</div>`;
  }

  function renderLiveTask() {
    const tasks = state.snapshot?.activeTasks || [];
    const root = $('live-task');
    if (!tasks.length) {
      root.innerHTML = `<div class="idle-state" data-testid="system-idle"><strong>SYSTEM IDLE</strong>WAITING FOR TASK</div>`;
      return;
    }
    root.innerHTML = tasks.map((task) => `
      <article class="project-card" data-task="${esc(task.taskId)}">
        <div class="kv">
          <span>Task</span><strong>${esc(task.taskId)}</strong>
          <span>Project</span><strong>${esc(task.project || task.projectId)}</strong>
          <span>Source</span><strong>${esc(task.source)}</strong>
          <span>GitHub</span><strong>${esc(task.githubRepo || '—')} ${task.githubIssueNumber ? `#${esc(task.githubIssueNumber)}` : ''}</strong>
          <span>Status</span><strong class="${pillClass(task.status)}">${esc(task.status)}</strong>
          <span>Created</span><strong>${esc(fmtDate(task.createdAt))}</strong>
          <span>Claimed</span><strong>${esc(fmtDate(task.claimedAt))}</strong>
          <span>Launch</span><strong>${esc(task.launchState)}</strong>
          <span>Session</span><strong>${esc(task.sessionState)}</strong>
          <span>Elapsed</span><strong>${esc(task.elapsed || '—')}</strong>
          <span>Phase</span><strong>${esc(task.lifecycle?.current || 'UNKNOWN')}</strong>
          <span>Updated</span><strong>${esc(fmtDate(task.lastUpdate))}</strong>
          <span>Result</span><strong>${esc(task.resultState)}</strong>
          <span>Provider</span><strong>${esc(task.provider || 'legacy')}</strong>
          <span>Execution</span><strong>${esc(task.executionState || '—')}</strong>
          <span>Verification</span><strong>${esc(task.verificationState || '—')}</strong>
          <span>Gate</span><strong class="${pillClass(task.gateState === 'WAITING' ? 'BLOCKED' : 'IDLE')}">${esc(task.gateState || '—')}</strong>
          <span>Issue</span><strong class="${pillClass(task.issueState)}">${esc(task.issueState || 'UNKNOWN')}</strong>
          <span>Warnings</span><strong>${esc((task.warnings || []).join(', ') || 'none')}</strong>
        </div>
        ${renderLifecycle(task)}
      </article>
    `).join('');
  }

  function renderAgents() {
    const agents = state.snapshot?.agents || [];
    if (!agents.length) {
      $('agents').innerHTML = '<div class="idle-state">NO ACTIVE AGENTS</div>';
      return;
    }
    $('agents').innerHTML = agents.map((agent) => `
      <div class="kv">
        <span>Project</span><strong>${esc(agent.project || agent.projectId)}</strong>
        <span>Task</span><strong>${esc(agent.taskId)}</strong>
        <span>Session</span><strong class="${pillClass(agent.sessionStatus)}">${esc(agent.sessionStatus)}</strong>
        <span>Started</span><strong>${esc(fmtTime(agent.startedAt))}</strong>
        <span>Elapsed</span><strong>${esc(agent.elapsed || '—')}</strong>
        <span>Launcher</span><strong>${esc(agent.launcherState)}</strong>
        <span>Claim</span><strong>${esc(agent.claimState)}</strong>
      </div>
    `).join('<hr>');
  }

  function renderGithub() {
    const gh = state.snapshot?.github || {};
    $('github').innerHTML = `
      <div class="kv">
        <span>State</span><strong class="${pillClass(gh.state)}">${esc(gh.state || 'UNKNOWN')}</strong>
        <span>Repos</span><strong>${esc((gh.repositories || []).join(', ') || '—')}</strong>
        <span>Last poll</span><strong>${esc(fmtTime(gh.lastPollAt))}</strong>
        <span>Next poll</span><strong>${esc(fmtTime(gh.nextPollAt))}</strong>
        <span>Eligible</span><strong>${esc(gh.eligibleIssueCount ?? 'UNKNOWN')}</strong>
        <span>Results</span><strong>${esc(gh.resultPosts ?? 0)}</strong>
        <span>Closes</span><strong>${esc(gh.closeOperations ?? 0)}</strong>
        <span>Last error</span><strong>${esc(gh.lastError || 'none')}</strong>
      </div>
    `;
  }

  function renderFirebase() {
    const fb = state.snapshot?.firebase || {};
    $('firebase').innerHTML = `
      <div class="kv">
        <span>State</span><strong class="${pillClass(fb.state)}">${esc(fb.state || 'UNKNOWN')}</strong>
        <span>INLINE</span><strong>${esc(fb.inline?.state || 'UNKNOWN')}</strong>
        <span>CHUNKS</span><strong>${esc(fb.chunks?.state || 'UNKNOWN')}</strong>
        <span>Activity</span><strong>${esc(fb.lastActivity ? fmtTime(fb.lastActivity) : 'UNKNOWN')}</strong>
      </div>
    `;
  }

  function renderProjects() {
    const projects = state.snapshot?.projects || [];
    const select = $('filter-project');
    const current = select.value;
    select.innerHTML = '<option value="">ALL</option>' + projects.map((project) => (
      `<option value="${esc(project.projectId)}">${esc(project.displayName || project.projectId)}</option>`
    )).join('');
    select.value = current;
    $('projects').innerHTML = projects.map((project) => `
      <article class="project-card">
        <h3>${esc(project.displayName || project.projectId)}</h3>
        <div class="kv">
          <span>ID</span><strong>${esc(project.projectId)}</strong>
          <span>Repo</span><strong>${esc(project.githubRepo || '—')}</strong>
          <span>Workspace</span><strong class="${pillClass(project.workspaceState)}">${esc(project.workspaceState || 'UNKNOWN')}</strong>
          <span>Health</span><strong class="${pillClass(project.health)}">${esc(project.health || 'UNKNOWN')}</strong>
          <span>Agent</span><strong>${esc(project.activeAgent?.taskId || 'none')}</strong>
          <span>Active task</span><strong>${esc(project.activeTask?.taskId || 'none')}</strong>
          <span>Last task</span><strong>${esc(project.lastTask?.taskId || 'none')}</strong>
          <span>READY</span><strong>${esc(project.counts?.READY ?? 0)}</strong>
          <span>IN_PROGRESS</span><strong>${esc(project.counts?.IN_PROGRESS ?? 0)}</strong>
          <span>FAILED/BLOCKED</span><strong>${esc(project.counts?.FAILED_BLOCKED ?? 0)}</strong>
        </div>
      </article>
    `).join('') || '<p>UNKNOWN</p>';
  }

  function currentFilters() {
    return {
      project: $('filter-project').value,
      status: $('filter-status').value,
      source: $('filter-source').value,
      taskId: $('filter-task').value.trim().toLowerCase(),
      githubIssue: $('filter-issue').value.trim(),
    };
  }

  function matchesFilters(task, filters) {
    if (filters.project && task.projectId !== filters.project) return false;
    if (filters.status && task.status !== filters.status) return false;
    if (filters.source && task.source !== filters.source) return false;
    if (filters.taskId) {
      const hay = `${task.taskId || ''} ${task.title || ''}`.toLowerCase();
      if (!hay.includes(filters.taskId)) return false;
    }
    if (filters.githubIssue) {
      const issue = String(task.githubIssueNumber || '');
      if (issue !== filters.githubIssue.replace(/^#/, '') && `#${issue}` !== filters.githubIssue) return false;
    }
    return true;
  }

  function renderTasks() {
    const tasks = state.snapshot?.recentTasks || [];
    const filters = currentFilters();
    const rows = tasks.filter((task) => matchesFilters(task, filters));
    const body = document.querySelector('#tasks-table tbody');
    body.innerHTML = rows.map((task) => `
      <tr data-task-id="${esc(task.taskId)}">
        <td>${esc(task.taskId)}<br><span class="k">${esc(task.title || '')}</span></td>
        <td>${esc(task.project || task.projectId)}</td>
        <td>${esc(task.source)}</td>
        <td><span class="${pillClass(task.status)}">${esc(task.status)}</span></td>
        <td>${esc(fmtTime(task.createdAt))}</td>
        <td>${esc(task.elapsed || task.duration || '—')}</td>
        <td>${task.githubIssueNumber ? `#${esc(task.githubIssueNumber)}` : '—'}<br><span class="${pillClass(task.issueState)}">${esc(task.issueState || 'UNKNOWN')}</span></td>
        <td>${esc(task.resultState)}</td>
      </tr>
    `).join('') || '<tr><td colspan="8">No matching tasks</td></tr>';
  }

  function renderTimeline() {
    $('timeline').innerHTML = state.events.map((item) => `
      <li class="${item.new ? 'new' : ''}">
        <span class="t">${esc(fmtTime(item.at))}</span>
        <span class="m"><strong>${esc(item.type)}</strong> ${esc(item.taskId || '')} ${esc(item.message)}</span>
      </li>
    `).join('') || '<li><span class="t">—</span><span class="m">No events yet</span></li>';
    state.events.forEach((item) => { item.new = false; });
  }

  function renderErrors() {
    $('errors').innerHTML = state.errors.map((item) => `
      <li>
        <span class="t">${esc(fmtTime(item.at))}</span>
        <span class="m"><strong>${esc(item.type)}</strong> ${esc(item.message)}</span>
      </li>
    `).join('') || '<li><span class="t">—</span><span class="m">No infrastructure errors</span></li>';
  }

  function formatDurationLabel(seconds) {
    const n = Number(seconds);
    if (n === 3600) return '1 hour';
    if (n === 86400) return '24 hours';
    if (n === 604800) return '7 days';
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n % 86400 === 0) return `${n / 86400} days`;
    if (n % 3600 === 0) return `${n / 3600} hours`;
    return `${Math.round(n / 60)} minutes`;
  }

  function chatgptInstruction(url) {
    return [
      'Use this YZ Dev Bridge handoff URL:',
      url,
      '',
      'Open it first to obtain your temporary session capability.',
      'Then use the existing YZ DEV BRIDGE directly.',
      'For prompts above the inline limit use CHUNKS:',
      'create → append → status → commit.',
      'Create exactly one final TASK.',
      'Do not use GitHub Issue as a substitute.',
    ].join('\n');
  }

  function effectiveSessionStatus(session, now = Date.now()) {
    if (!session) return 'EXPIRED';
    if (session.revokedAt || session.status === 'REVOKED') return 'REVOKED';
    if (session.status === 'EXPIRED') return 'EXPIRED';
    const expiresMs = Date.parse(session.expiresAt || '');
    if (Number.isFinite(expiresMs) && expiresMs <= now) return 'EXPIRED';
    return 'ACTIVE';
  }

  function classifySessions(sessions, now = Date.now()) {
    const list = Array.isArray(sessions) ? sessions : [];
    const active = [];
    const history = [];
    for (const session of list) {
      const effective = effectiveSessionStatus(session, now);
      const view = { ...session, effectiveStatus: effective };
      if (effective === 'ACTIVE') active.push(view);
      else history.push(view);
    }
    return { active, history };
  }

  function renderSessionCard(session, { actionable }) {
    const status = session.effectiveStatus || effectiveSessionStatus(session);
    const statusClass = status === 'ACTIVE' ? 'active' : status === 'REVOKED' ? 'revoked' : 'expired';
    const revokeBtn = actionable && status === 'ACTIVE'
      ? `<button type="button" class="btn danger small btn-revoke-session" data-testid="btn-revoke-session" data-session-id="${esc(session.id)}">Revoke</button>`
      : '';
    const revokedLine = session.revokedAt
      ? `<span>Revoked ${esc(fmtDate(session.revokedAt))}</span>`
      : '';
    return `
      <article class="session-card ${actionable ? '' : 'history'}" data-testid="${actionable ? 'session-card-active' : 'session-card-history'}" data-session-id="${esc(session.id)}" data-session-status="${esc(status)}">
        <div class="meta">
          <strong class="session-status ${statusClass}" data-testid="session-status">${esc(status)}</strong>
          <span>Created ${esc(fmtDate(session.createdAt))}</span>
          <span>Expires ${esc(fmtDate(session.expiresAt))}</span>
          <span>Last used ${esc(fmtDate(session.lastUsedAt))}</span>
          ${revokedLine}
          <span>${esc(session.label || session.createdVia || 'dashboard-handoff')}</span>
        </div>
        ${revokeBtn}
      </article>
    `;
  }

  function renderHandoff() {
    const result = $('handoff-result');
    const error = $('handoff-error');
    const activeList = $('chatgpt-sessions-active');
    const historyList = $('chatgpt-sessions-history');
    const revokeAllBtn = $('btn-revoke-all-sessions');
    if (!result || !error || !activeList || !historyList || !revokeAllBtn) return;

    if (state.handoffServiceConfigured === false && !state.handoff) {
      error.hidden = false;
      error.textContent = 'ChatGPT handoff service not configured';
    }

    if (state.handoff) {
      result.hidden = false;
      const bootstrapMins = Math.round((state.handoff.expiresInSeconds || 600) / 60);
      const sessionLabel = formatDurationLabel(state.handoff.requestedSessionDurationSeconds);
      $('handoff-meta').textContent = `Valid for bootstrap: ${bootstrapMins} minutes · Session after use: ${sessionLabel}`;
    }

    const { active, history } = classifySessions(state.sessions);
    if (!active.length) {
      activeList.innerHTML = '<div class="session-empty" data-testid="sessions-active-empty">No active temporary sessions</div>';
      revokeAllBtn.hidden = true;
    } else {
      activeList.innerHTML = active.map((session) => renderSessionCard(session, { actionable: true })).join('');
      revokeAllBtn.hidden = false;
      revokeAllBtn.disabled = false;
      revokeAllBtn.textContent = active.length > 1 ? `Revoke All (${active.length})` : 'Revoke All';
    }

    if (!history.length) {
      historyList.innerHTML = '<div class="session-empty" data-testid="sessions-history-empty">No session history yet</div>';
    } else {
      historyList.innerHTML = history.map((session) => renderSessionCard(session, { actionable: false })).join('');
    }
  }

  async function copyText(value, statusMessage) {
    await navigator.clipboard.writeText(value);
    const status = $('handoff-copy-status');
    status.hidden = false;
    status.textContent = statusMessage;
    setTimeout(() => { status.hidden = true; }, 2500);
  }

  async function createHandoff() {
    const error = $('handoff-error');
    const tech = $('handoff-tech-body');
    error.hidden = true;
    error.textContent = '';
    $('btn-create-handoff').disabled = true;
    try {
      const duration = $('handoff-duration').value || '24h';
      const res = await fetch('/api/chatgpt-handoff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ duration }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        error.hidden = false;
        error.textContent = data.error || 'Unable to create handoff';
        tech.textContent = data.detail || data.code || '';
        state.handoffServiceConfigured = data.code !== 'not_configured' ? state.handoffServiceConfigured : false;
        return;
      }
      state.handoff = data;
      state.handoffServiceConfigured = true;
      tech.textContent = `handoffId=${data.handoffId || '—'}\nexpiresAt=${data.expiresAt || '—'}`;
      renderHandoff();
      await refreshSessions();
    } catch (err) {
      error.hidden = false;
      error.textContent = 'Unable to create handoff';
      tech.textContent = String(err && err.message ? err.message : err);
    } finally {
      $('btn-create-handoff').disabled = false;
    }
  }

  async function refreshSessions() {
    try {
      const res = await fetch('/api/chatgpt-sessions');
      const data = await res.json();
      if (res.ok && data.ok) {
        state.sessions = data.sessions || [];
        state.handoffServiceConfigured = true;
      } else if (data.code === 'not_configured') {
        state.handoffServiceConfigured = false;
        state.sessions = [];
      }
      renderHandoff();
    } catch {
      // leave previous list
    }
  }

  async function revokeSession(sessionId) {
    const id = String(sessionId || '');
    const target = (state.sessions || []).find((s) => s.id === id);
    if (!target || effectiveSessionStatus(target) !== 'ACTIVE') {
      await refreshSessions();
      return;
    }
    await fetch(`/api/chatgpt-sessions/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
    await refreshSessions();
  }

  async function revokeAllSessions() {
    const { active } = classifySessions(state.sessions);
    if (!active.length) {
      renderHandoff();
      return;
    }
    const label = active.length === 1
      ? 'Revoke 1 active ChatGPT session? The permanent Bridge key is not affected.'
      : `Revoke ${active.length} active ChatGPT sessions? The permanent Bridge key is not affected.`;
    if (!window.confirm(label)) return;
    await fetch('/api/chatgpt-sessions/revoke-all', { method: 'POST' });
    await refreshSessions();
  }

  function renderAll() {
    renderHeader();
    renderKpi();
    renderSubsystems();
    renderLiveTask();
    renderAgents();
    renderGithub();
    renderFirebase();
    renderProjects();
    renderTasks();
    renderTimeline();
    renderErrors();
    renderHandoff();
  }

  async function openTask(taskId) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}${state.debug ? '?debug=1' : ''}`);
    const data = await res.json();
    const task = data.task;
    if (!task) return;
    $('drawer-title').textContent = task.taskId;
    const rows = [
      ['taskId', task.taskId],
      ['projectId', task.projectId],
      ['status', task.status],
      ['source', task.source],
      ['GitHub', `${task.githubRepo || '—'} ${task.githubIssueNumber ? `#${task.githubIssueNumber}` : ''}`],
      ['issue', task.issueState],
      ['created', fmtDate(task.createdAt)],
      ['claimed', fmtDate(task.claimedAt)],
      ['updated', fmtDate(task.updatedAt)],
      ['launch', task.launch?.state || task.launchState],
      ['session', task.sessionState],
      ['resultSummary', task.resultSummary],
      ['rootCause', task.rootCause],
      ['changedFiles', (task.changedFiles || []).join(', ')],
      ['tests', (task.tests || []).join(', ')],
      ['build', task.build],
      ['behaviorChanged', (task.behaviorChanged || []).join(', ')],
      ['behaviorPreserved', (task.behaviorPreserved || []).join(', ')],
      ['warnings', (task.warnings || []).join(', ')],
      ['remainingIssues', (task.remainingIssues || []).join(', ')],
      ['nextRecommendedStep', task.nextRecommendedStep],
    ];
    $('drawer-body').innerHTML = `
      <div class="kv">${rows.map(([k, v]) => `<span>${esc(k)}</span><strong>${esc(v || '—')}</strong>`).join('')}</div>
      ${renderLifecycle(task)}
      ${state.debug && task.raw ? `<div class="raw-block">${esc(JSON.stringify(task.raw, null, 2))}</div>` : ''}
    `;
    $('drawer-backdrop').hidden = false;
  }

  async function postControl(path) {
    $('control-note').textContent = 'Working…';
    const res = await fetch(path, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      $('control-note').textContent = data.error || `Request failed (${res.status})`;
      return;
    }
    $('control-note').textContent = data.message || data.state || 'OK';
    const status = await fetch('/api/status').then((item) => item.json());
    mergeState({
      systemState: status.systemState,
      relay: status.relay,
      subsystems: status.subsystems,
      version: status.version,
      startedAt: status.startedAt,
    });
  }

  function connectSse() {
    const source = new EventSource('/events');
    source.addEventListener('snapshot', (event) => {
      state.connected = true;
      applySnapshot(JSON.parse(event.data));
    });
    source.addEventListener('state', (event) => {
      mergeState(JSON.parse(event.data));
    });
    source.addEventListener('status', (event) => {
      const payload = JSON.parse(event.data);
      mergeState(payload);
    });
    source.addEventListener('stats', (event) => {
      mergeState({ stats: JSON.parse(event.data) });
    });
    source.addEventListener('projects', (event) => {
      mergeState(JSON.parse(event.data));
    });
    source.addEventListener('relay', (event) => {
      mergeState({ relay: JSON.parse(event.data) });
    });
    source.addEventListener('event', (event) => {
      pushEvent(JSON.parse(event.data));
    });
    source.addEventListener('health', (event) => {
      pushEvent(JSON.parse(event.data));
    });
    source.addEventListener('heartbeat', () => {
      state.connected = true;
      renderHeader();
    });
    source.onerror = () => {
      state.connected = false;
      renderHeader();
    };
    source.onopen = () => {
      state.connected = true;
      renderHeader();
    };
  }

  function tickClock() {
    $('clock').textContent = new Date().toLocaleTimeString([], { hour12: false });
    if (state.startedAt) {
      $('uptime').textContent = fmtUptime(Date.now() - Date.parse(state.startedAt));
    } else if (state.snapshot?.uptimeMs != null) {
      $('uptime').textContent = fmtUptime(state.snapshot.uptimeMs);
    }
  }

  document.querySelector('#tasks-table').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-task-id]');
    if (row) openTask(row.getAttribute('data-task-id'));
  });
  $('drawer-close').addEventListener('click', () => { $('drawer-backdrop').hidden = true; });
  $('drawer-backdrop').addEventListener('click', (event) => {
    if (event.target === $('drawer-backdrop')) $('drawer-backdrop').hidden = true;
  });
  ['filter-project', 'filter-status', 'filter-source', 'filter-task', 'filter-issue'].forEach((id) => {
    $(id).addEventListener('input', renderTasks);
    $(id).addEventListener('change', renderTasks);
  });
  $('btn-start').addEventListener('click', () => postControl('/api/relay/start'));
  $('btn-stop').addEventListener('click', () => postControl('/api/relay/stop'));
  $('btn-restart').addEventListener('click', () => postControl('/api/relay/restart'));
  $('btn-restart-after').addEventListener('click', () => postControl('/api/relay/restart-after-current-task'));
  $('btn-create-handoff').addEventListener('click', () => { void createHandoff(); });
  $('btn-create-handoff-again').addEventListener('click', () => { void createHandoff(); });
  $('btn-copy-handoff').addEventListener('click', () => {
    if (!state.handoff?.bootstrapUrl) return;
    void copyText(state.handoff.bootstrapUrl, 'Handoff link copied');
  });
  $('btn-copy-handoff-msg').addEventListener('click', () => {
    if (!state.handoff?.bootstrapUrl) return;
    void copyText(chatgptInstruction(state.handoff.bootstrapUrl), 'ChatGPT instruction copied');
  });
  $('btn-revoke-all-sessions').addEventListener('click', () => { void revokeAllSessions(); });
  $('chatgpt-sessions-active').addEventListener('click', (event) => {
    const btn = event.target.closest('.btn-revoke-session');
    if (!btn) return;
    void revokeSession(btn.getAttribute('data-session-id'));
  });
  $('debug-toggle').addEventListener('change', (event) => {
    state.debug = Boolean(event.target.checked);
    const params = new URLSearchParams(window.location.search);
    if (state.debug) params.set('debug', '1');
    else params.delete('debug');
    const next = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
    window.history.replaceState({}, '', next);
  });

  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    state.debug = true;
    $('debug-toggle').checked = true;
  }

  fetch('/api/status').then((res) => res.json()).then((status) => {
    mergeState(status);
    return fetch('/api/stats');
  }).then((res) => res.json()).then((stats) => {
    mergeState({ stats });
    return fetch('/api/projects');
  }).then((res) => res.json()).then((projects) => {
    mergeState(projects);
    return fetch('/api/tasks?limit=40');
  }).then((res) => res.json()).then((tasks) => {
    mergeState({ recentTasks: tasks.tasks || [] });
  }).catch(() => undefined);

  void refreshSessions();
  fetch('/api/chatgpt-handoff/status').then((res) => res.json()).then((status) => {
    state.handoffServiceConfigured = Boolean(status.configured);
    renderHandoff();
  }).catch(() => undefined);

  connectSse();
  tickClock();
  setInterval(tickClock, 1000);
})();
