import fs from 'node:fs';
import crypto from 'node:crypto';

const dbPath = 'database/app-db.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const secret = process.env.JWT_SECRET || 'dev-secret-change-me';

function hashPassword(password) {
  return crypto.createHash('sha256').update(`${secret}:${password || ''}`).digest('hex');
}

for (let i = 1; i <= 20; i += 1) {
  const n = String(i).padStart(2, '0');
  const email = `usuario${n}@porra.local`;
  const existing = db.users.find((user) => user.email === email);
  const user = {
    id: `user_${n}`,
    name: `Usuario ${n}`,
    email,
    role: 'user',
    passwordHash: hashPassword(`Copa2026-${n}`),
    createdAt: new Date().toISOString()
  };
  if (existing) Object.assign(existing, user);
  else db.users.push(user);
}

db.logs ||= [];
db.logs.push({
  id: `log_${Date.now()}`,
  type: 'users',
  message: '20 usuarios de invitacion creados o actualizados.',
  createdAt: new Date().toISOString()
});

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`Usuarios totales: ${db.users.length}`);
