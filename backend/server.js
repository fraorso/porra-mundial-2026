import http from 'node:http';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { recalculateScores } from './src/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 3000);
const dbFile = path.join(rootDir, 'database', 'app-db.json');
const seedFile = path.join(rootDir, 'database', 'seed.json');
const frontendDir = path.join(rootDir, 'frontend');
const secret = process.env.JWT_SECRET || 'dev-secret-change-me';

await ensureDatabase();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/')) {
      return await routeApi(req, res, url);
    }

    return await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Error interno' });
  }
});

server.listen(port, () => {
  console.log(`Porra Mundial lista en http://localhost:${port}`);
});

async function routeApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    const db = await readDb();
    return sendJson(res, 200, { ok: true, matches: db.matches.length, users: db.users.length });
  }

  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    const db = await readDb();
    const user = currentUser(req, db);
    return sendJson(res, 200, publicState(db, user?.id));
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJson(req);
    const db = await readDb();
    const user = db.users.find((u) => u.email.toLowerCase() === String(body.email || '').toLowerCase());
    const migrated = migrateKnownPassword(user, body.password);
    if (!user || (user.passwordHash !== hashPassword(body.password) && !migrated)) {
      return sendJson(res, 401, { error: 'Credenciales no validas.' });
    }
    if (migrated) await writeDb(db);
    return sendJson(res, 200, { token: signToken(user), user: safeUser(user) });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await readJson(req);
    const db = await readDb();
    if (!db.settings.registrationOpen) return sendJson(res, 403, { error: 'El registro esta cerrado.' });
    if (!body.name || !body.email || !body.password) return sendJson(res, 400, { error: 'Nombre, email y password son obligatorios.' });
    if (db.users.some((u) => u.email.toLowerCase() === String(body.email).toLowerCase())) {
      return sendJson(res, 409, { error: 'Ya existe un usuario con ese email.' });
    }
    const user = {
      id: uid('user'),
      name: String(body.name).trim(),
      email: String(body.email).trim().toLowerCase(),
      role: 'user',
      passwordHash: hashPassword(body.password),
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    await writeDb(db);
    return sendJson(res, 200, { token: signToken(user), user: safeUser(user) });
  }

  const db = await readDb();
  const user = currentUser(req, db);
  if (!user) return sendJson(res, 401, { error: 'Sesion no valida.' });

  if (req.method === 'GET' && url.pathname === '/api/me') {
    return sendJson(res, 200, {
      user: safeUser(user),
      predictions: db.predictions.filter((p) => p.userId === user.id)
    });
  }

  if (req.method === 'PUT' && url.pathname === '/api/predictions') {
    if (predictionsLocked(db)) return sendJson(res, 423, { error: 'Los pronosticos estan bloqueados por fecha limite.' });
    const body = await readJson(req);
    const validMatchIds = new Set(db.matches.map((m) => m.id));
    const cleaned = (body.predictions || [])
      .filter((p) => validMatchIds.has(Number(p.matchId)))
      .map((p) => ({
        userId: user.id,
        matchId: Number(p.matchId),
        homeScore: Number.isInteger(Number(p.homeScore)) ? Number(p.homeScore) : null,
        awayScore: Number.isInteger(Number(p.awayScore)) ? Number(p.awayScore) : null,
        updatedAt: new Date().toISOString()
      }));
    db.predictions = db.predictions.filter((p) => p.userId !== user.id);
    db.predictions.push(...cleaned);
    recalculateScores(db);
    await writeDb(db);
    return sendJson(res, 200, publicState(db, user.id));
  }

  if (user.role !== 'admin' && url.pathname.startsWith('/api/admin/')) {
    return sendJson(res, 403, { error: 'Solo administradores.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/recalculate') {
    recalculateScores(db);
    db.logs.push(log('score', 'Puntuaciones recalculadas manualmente.'));
    await writeDb(db);
    return sendJson(res, 200, publicState(db, user.id));
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/results/refresh') {
    db.logs.push(log('results', 'Proveedor mock activo: no se han modificado resultados.'));
    await writeDb(db);
    return sendJson(res, 200, { updated: 0, state: publicState(db, user.id) });
  }

  if (req.method === 'PATCH' && url.pathname === '/api/admin/settings') {
    const body = await readJson(req);
    db.settings = { ...db.settings, ...body };
    db.logs.push(log('settings', 'Configuracion actualizada.'));
    await writeDb(db);
    return sendJson(res, 200, publicState(db, user.id));
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/rules/')) {
    const key = decodeURIComponent(url.pathname.split('/').pop());
    const body = await readJson(req);
    const rule = db.scoringRules.find((r) => r.key === key);
    if (!rule) return sendJson(res, 404, { error: 'Regla no encontrada.' });
    rule.points = Number(body.points || 0);
    recalculateScores(db);
    await writeDb(db);
    return sendJson(res, 200, publicState(db, user.id));
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/export-ranking.csv') {
    recalculateScores(db);
    const rows = [['posicion', 'usuario', 'puntos', 'diferencia_lider']];
    db.ranking.forEach((r) => rows.push([r.position, r.name, r.points, r.gap]));
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
    return res.end(rows.map((r) => r.join(',')).join('\n'));
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/import-excel') {
    return sendJson(res, 501, {
      error: 'La importacion desde navegador requiere instalar dependencias npm. La app ya esta cargada con los Excel iniciales.'
    });
  }

  sendJson(res, 404, { error: 'Ruta no encontrada.' });
}

async function serveStatic(res, pathname) {
  const clean = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const target = path.normalize(path.join(frontendDir, clean));
  if (!target.startsWith(frontendDir)) return sendJson(res, 403, { error: 'No permitido.' });
  const exists = fssync.existsSync(target);
  const file = exists ? target : path.join(frontendDir, 'index.html');
  const ext = path.extname(file);
  const type = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  }[ext] || 'application/octet-stream';
  const bytes = await fs.readFile(file);
  res.writeHead(200, { 'Content-Type': type });
  res.end(bytes);
}

async function ensureDatabase() {
  const existing = await fs.readFile(dbFile, 'utf8').catch(() => null);
  if (existing) return;
  const seed = JSON.parse(await fs.readFile(seedFile, 'utf8'));
  const db = {
    ...seed,
    users: [{
      id: 'admin',
      name: 'Administrador',
      email: (process.env.ADMIN_EMAIL || 'admin@porra.local').toLowerCase(),
      role: 'admin',
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD || 'admin123'),
      createdAt: new Date().toISOString()
    }],
    predictions: [],
    specialAnswers: [],
    ranking: [],
    logs: [log('boot', 'Base de datos inicializada desde seed.json.')]
  };
  provisionInviteUsers(db);
  recalculateScores(db);
  await writeDb(db);
}

function provisionInviteUsers(db) {
  const count = Number(process.env.INVITE_USERS || 20);
  for (let i = 1; i <= count; i += 1) {
    const n = String(i).padStart(2, '0');
    const email = `usuario${n}@porra.local`;
    if (db.users.some((user) => user.email === email)) continue;
    db.users.push({
      id: `user_${n}`,
      name: `Usuario ${n}`,
      email,
      role: 'user',
      passwordHash: hashPassword(`Copa2026-${n}`),
      createdAt: new Date().toISOString()
    });
  }
  db.logs.push(log('users', `${count} usuarios de invitacion preparados.`));
}

async function readDb() {
  return JSON.parse(await fs.readFile(dbFile, 'utf8'));
}

async function writeDb(db) {
  db.updatedAt = new Date().toISOString();
  await fs.writeFile(dbFile, JSON.stringify(db, null, 2), 'utf8');
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8') || '{}';
  return JSON.parse(text);
}

function publicState(db, userId = null) {
  recalculateScores(db);
  return {
    metadata: db.metadata,
    settings: db.settings,
    teams: db.teams,
    matches: db.matches,
    scoringRules: db.scoringRules,
    specialPredictions: db.specialPredictions,
    ranking: db.ranking,
    logs: db.logs.slice(-80).reverse(),
    locked: predictionsLocked(db),
    me: userId ? safeUser(db.users.find((u) => u.id === userId)) : null,
    myPredictions: userId ? db.predictions.filter((p) => p.userId === userId) : []
  };
}

function predictionsLocked(db) {
  const deadline = new Date(db.settings.predictionDeadline || db.metadata.firstKickoff).getTime();
  return Number.isFinite(deadline) && Date.now() >= deadline;
}

function currentUser(req, db) {
  const header = req.headers.authorization || '';
  const [, token] = header.split(' ');
  const payload = verifyToken(token);
  return payload ? db.users.find((u) => u.id === payload.id) : null;
}

function signToken(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 7 * 86400_000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token = '') {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  return data.exp > Date.now() ? data : null;
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(`${secret}:${password || ''}`).digest('hex');
}

function migrateKnownPassword(user, password) {
  if (!user) return false;
  const plain = String(password || '');
  const isAdminFallback = user.role === 'admin' && plain === (process.env.ADMIN_PASSWORD || 'admin123');
  const inviteMatch = /^usuario(\d{2})@porra\.local$/i.exec(user.email || '');
  const isInviteFallback = inviteMatch && plain === `Copa2026-${inviteMatch[1]}`;
  if (!isAdminFallback && !isInviteFallback) return false;
  user.passwordHash = hashPassword(plain);
  return true;
}

function safeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function log(type, message) {
  return { id: uid('log'), type, message, createdAt: new Date().toISOString() };
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
