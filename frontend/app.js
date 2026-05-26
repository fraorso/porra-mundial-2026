const state = {
  data: null,
  token: localStorage.getItem('token'),
  view: 'dashboard',
  authMode: 'login',
  draft: new Map()
};

const $ = (selector) => document.querySelector(selector);
const app = $('#app');

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Error inesperado');
  return body;
}

async function load() {
  state.data = await api('/api/bootstrap');
  for (const p of state.data.myPredictions || []) state.draft.set(p.matchId, p);
  render();
}

function render() {
  if (!state.token) return renderAuth();
  const user = state.data?.me;
  app.innerHTML = `
    <main class="shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">26</div><div><h1>Porra Mundial</h1><p>${state.data.metadata.title}</p></div></div>
        <nav class="nav">
          ${navButton('dashboard', 'Dashboard')}
          ${navButton('matches', 'Partidos')}
          ${navButton('ranking', 'Clasificacion')}
          ${navButton('profile', 'Perfil')}
          ${user?.role === 'admin' ? navButton('admin', 'Admin') : ''}
        </nav>
        <div class="card" style="margin-top:18px">
          <b>${user?.name || ''}</b>
          <p class="muted">${user?.email || ''}</p>
          <button class="ghost" data-action="logout" style="width:100%;margin-top:12px">Salir</button>
        </div>
      </aside>
      <section class="content">${viewHtml()}</section>
    </main>`;
  bind();
}

function navButton(view, label) {
  return `<button class="${state.view === view ? 'active' : ''}" data-view="${view}">${label}</button>`;
}

function viewHtml() {
  if (state.view === 'matches') return matchesHtml();
  if (state.view === 'ranking') return rankingHtml();
  if (state.view === 'profile') return profileHtml();
  if (state.view === 'admin') return adminHtml();
  return dashboardHtml();
}

function dashboardHtml() {
  const data = state.data;
  const finished = data.matches.filter((m) => m.status === 'finished').length;
  const progress = Math.round((finished / data.matches.length) * 100);
  const next = data.matches.find((m) => new Date(m.kickoff) > new Date()) || data.matches[0];
  return `
    <div class="topbar"><div><h2>Centro de competicion</h2><p class="muted">${data.locked ? 'Pronosticos bloqueados' : 'Pronosticos abiertos'} hasta ${fmt(data.settings.predictionDeadline)}</p></div><div class="actions"><button class="primary" data-view="matches">Rellenar pronosticos</button></div></div>
    <div class="grid cols-4">
      ${kpi('Equipos', data.teams.length)}
      ${kpi('Partidos', data.matches.length)}
      ${kpi('Jugados', finished)}
      ${kpi('Reglas Excel', data.scoringRules.length)}
    </div>
    <div class="section-title"><h3>Progreso del Mundial</h3><span class="pill">${progress}%</span></div>
    <div class="card"><div class="progress"><span style="width:${progress}%"></span></div></div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card"><h3>Proximo partido</h3>${matchCard(next, false)}</div>
      <div class="card"><h3>Top 5</h3>${rankingRows(data.ranking.slice(0, 5))}</div>
    </div>`;
}

function kpi(label, value) {
  return `<div class="card kpi"><span class="muted">${label}</span><b>${value}</b></div>`;
}

function matchesHtml() {
  const groups = groupBy(state.data.matches, (m) => m.phase);
  return `
    <div class="topbar"><div><h2>Pronosticos</h2><p class="muted">Guardado automatico al pulsar guardar. ${state.data.locked ? 'Modo solo lectura.' : 'Puedes editar hasta la fecha limite.'}</p></div><button class="primary" data-action="savePredictions" ${state.data.locked ? 'disabled' : ''}>Guardar</button></div>
    ${Object.entries(groups).map(([phase, matches]) => `
      <div class="section-title"><h3>${phase}</h3><span class="pill">${matches.length} partidos</span></div>
      <div class="match-list">${matches.map((m) => matchCard(m, true)).join('')}</div>
    `).join('')}`;
}

function matchCard(match, editable) {
  const p = state.draft.get(match.id) || {};
  const locked = state.data.locked || !editable;
  return `<article class="match">
    <span class="pill">#${match.id} ${match.group ? `G${match.group}` : ''}</span>
    <div class="team"><span>${match.homeFlag}</span><span>${match.homeTeam}</span></div>
    <div class="score">
      <input type="number" min="0" value="${p.homeScore ?? ''}" data-score="${match.id}:home" ${locked ? 'disabled' : ''}>
      <span>${match.homeScore ?? '-'}:${match.awayScore ?? '-'}</span>
      <input type="number" min="0" value="${p.awayScore ?? ''}" data-score="${match.id}:away" ${locked ? 'disabled' : ''}>
    </div>
    <div class="team"><span>${match.awayFlag}</span><span>${match.awayTeam}</span></div>
    <span class="muted">${fmt(match.kickoff)}</span>
  </article>`;
}

function rankingHtml() {
  return `<div class="topbar"><div><h2>Clasificacion</h2><p class="muted">Ranking recalculado en tiempo real segun las reglas importadas del Excel.</p></div></div><div class="card">${rankingRows(state.data.ranking)}</div>`;
}

function rankingRows(rows) {
  if (!rows.length) return '<p class="muted">Aun no hay participantes.</p>';
  return rows.map((r) => `<div class="ranking-row"><b class="${r.position <= 3 ? 'medal' : ''}">#${r.position}</b><span>${r.name}</span><b>${r.points}</b><span class="muted">-${r.gap}</span></div>`).join('');
}

function profileHtml() {
  const mine = state.data.myPredictions.length;
  return `<div class="topbar"><div><h2>Perfil</h2><p class="muted">Tus pronosticos y estado de bloqueo.</p></div></div>
    <div class="grid cols-2">
      <div class="card"><h3>Pronosticos completados</h3><b style="font-size:42px">${mine}/${state.data.matches.length}</b></div>
      <div class="card"><h3>Fecha limite</h3><p>${fmt(state.data.settings.predictionDeadline)}</p><span class="pill">${state.data.locked ? 'Bloqueado' : 'Abierto'}</span></div>
    </div>`;
}

function adminHtml() {
  return `<div class="topbar"><div><h2>Panel admin</h2><p class="muted">Importacion Excel, reglas, resultados y logs.</p></div><div class="actions"><button class="primary" data-action="refreshResults">Actualizar resultados</button><button class="ghost" data-action="recalculate">Recalcular</button><a class="ghost" href="/api/admin/export-ranking.csv">Exportar CSV</a></div></div>
    <div class="grid cols-2 admin">
      <div class="card"><h3>Configuracion</h3>
        <label>Fecha limite<input id="deadline" type="datetime-local" value="${localInputDate(state.data.settings.predictionDeadline)}"></label>
        <label><input id="registrationOpen" type="checkbox" ${state.data.settings.registrationOpen ? 'checked' : ''} style="width:auto"> Registro abierto</label>
        <button class="primary" data-action="saveSettings">Guardar configuracion</button>
      </div>
      <div class="card"><h3>Subir Excel</h3>
        <input id="adminExcel" type="file" accept=".xlsx">
        <input id="userExcel" type="file" accept=".xlsx">
        <button class="primary" data-action="uploadExcel">Importar</button>
      </div>
      <div class="card"><h3>Reglas de puntuacion</h3>${state.data.scoringRules.map((r) => `<label>${r.label}<input type="number" data-rule="${r.key}" value="${r.points}"></label>`).join('')}</div>
      <div class="card"><h3>Logs</h3>${state.data.logs.map((l) => `<p class="log">${fmt(l.createdAt)} ${l.type}: ${l.message}</p>`).join('')}</div>
    </div>`;
}

function renderAuth(error = '') {
  app.innerHTML = `<section class="auth card">
    <div class="brand"><div class="brand-mark">26</div><div><h1>Porra Mundial 2026</h1><p>Accede para jugar o administrar</p></div></div>
    ${error ? `<p class="danger">${error}</p>` : ''}
    <input id="name" placeholder="Nombre" style="${state.authMode === 'login' ? 'display:none' : ''}">
    <input id="email" placeholder="Email" value="${state.authMode === 'login' ? 'admin@porra.local' : ''}">
    <input id="password" type="password" placeholder="Password" value="${state.authMode === 'login' ? 'admin123' : ''}">
    <button class="primary" data-action="auth">${state.authMode === 'login' ? 'Entrar' : 'Registrarme'}</button>
    <button class="ghost" data-action="toggleAuth">${state.authMode === 'login' ? 'Crear cuenta' : 'Ya tengo cuenta'}</button>
  </section>`;
  bind();
}

function bind() {
  document.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => { state.view = el.dataset.view; render(); }));
  document.querySelectorAll('[data-score]').forEach((el) => el.addEventListener('input', () => {
    const [id, side] = el.dataset.score.split(':');
    const current = state.draft.get(Number(id)) || { matchId: Number(id), homeScore: null, awayScore: null };
    current[side === 'home' ? 'homeScore' : 'awayScore'] = el.value === '' ? null : Number(el.value);
    state.draft.set(Number(id), current);
  }));
  document.querySelectorAll('[data-rule]').forEach((el) => el.addEventListener('change', async () => {
    state.data = await api(`/api/admin/rules/${el.dataset.rule}`, { method: 'PATCH', body: JSON.stringify({ points: Number(el.value) }) });
    render();
  }));
  document.querySelectorAll('[data-action]').forEach((el) => el.addEventListener('click', handleAction));
}

async function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  try {
    if (action === 'logout') { localStorage.removeItem('token'); state.token = null; return renderAuth(); }
    if (action === 'toggleAuth') { state.authMode = state.authMode === 'login' ? 'register' : 'login'; return renderAuth(); }
    if (action === 'auth') return auth();
    if (action === 'savePredictions') {
      state.data = await api('/api/predictions', { method: 'PUT', body: JSON.stringify({ predictions: [...state.draft.values()] }) });
      return render();
    }
    if (action === 'recalculate') state.data = await api('/api/admin/recalculate', { method: 'POST' });
    if (action === 'refreshResults') state.data = (await api('/api/admin/results/refresh', { method: 'POST' })).state;
    if (action === 'saveSettings') {
      state.data = await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ predictionDeadline: new Date($('#deadline').value).toISOString(), registrationOpen: $('#registrationOpen').checked }) });
    }
    if (action === 'uploadExcel') return uploadExcel();
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function auth() {
  try {
    const payload = { email: $('#email').value, password: $('#password').value, name: $('#name')?.value };
    const endpoint = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const result = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    state.token = result.token;
    localStorage.setItem('token', state.token);
    await load();
  } catch (error) {
    renderAuth(error.message);
  }
}

async function uploadExcel() {
  const form = new FormData();
  form.append('adminExcel', $('#adminExcel').files[0]);
  form.append('userExcel', $('#userExcel').files[0]);
  const response = await fetch('/api/admin/import-excel', { method: 'POST', headers: { Authorization: `Bearer ${state.token}` }, body: form });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  state.data = body;
  render();
}

function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] ||= [];
    acc[key].push(item);
    return acc;
  }, {});
}

function fmt(value) {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function localInputDate(value) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

load().catch(() => renderAuth());
