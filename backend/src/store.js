import fs from 'node:fs/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { hashPassword } from './auth.js';
import { recalculateScores } from './scoring.js';

export async function createStore(rootDir) {
  const dbFile = path.join(rootDir, 'database', 'app-db.json');
  const seedFile = path.join(rootDir, 'database', 'seed.json');
  const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me';

  const store = {
    current: null,
    uid(prefix) {
      return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    },
    log(type, message) {
      return { id: this.uid('log'), type, message, createdAt: new Date().toISOString() };
    },
    safeUser(user) {
      if (!user) return null;
      const { passwordHash, ...safe } = user;
      return safe;
    },
    async read() {
      if (!this.current) {
        const text = await fs.readFile(dbFile, 'utf8').catch(() => null);
        this.current = text ? JSON.parse(text) : null;
      }
      return structuredClone(this.current);
    },
    async write(db) {
      db.updatedAt = new Date().toISOString();
      this.current = structuredClone(db);
      await fs.mkdir(path.dirname(dbFile), { recursive: true });
      await fs.writeFile(dbFile, JSON.stringify(db, null, 2), 'utf8');
    },
    async ensureBootstrapped({ adminEmail, adminPassword }) {
      const existing = await fs.readFile(dbFile, 'utf8').catch(() => null);
      if (existing) {
        this.current = JSON.parse(existing);
        return;
      }
      const seed = JSON.parse(await fs.readFile(seedFile, 'utf8'));
      const db = {
        ...seed,
        users: [{
          id: 'admin',
          name: 'Administrador',
          email: adminEmail.toLowerCase(),
          role: 'admin',
          passwordHash: await hashPassword(adminPassword),
          createdAt: new Date().toISOString()
        }],
        predictions: [],
        specialAnswers: [],
        ranking: [],
        logs: [this.log('boot', 'Base de datos inicializada desde seed.json.')]
      };
      recalculateScores(db);
      await this.write(db);
    },
    getUserFromHeader(header) {
      try {
        const [, token] = header.split(' ');
        const payload = jwt.verify(token, jwtSecret);
        return this.current?.users?.find((u) => u.id === payload.id) || null;
      } catch {
        return null;
      }
    },
    predictionsLocked(db) {
      const deadline = new Date(db.settings.predictionDeadline || db.metadata.firstKickoff).getTime();
      return Number.isFinite(deadline) && Date.now() >= deadline;
    },
    publicState(db, userId = null) {
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
        locked: this.predictionsLocked(db),
        me: userId ? this.safeUser(db.users.find((u) => u.id === userId)) : null,
        myPredictions: userId ? db.predictions.filter((p) => p.userId === userId) : []
      };
    }
  };
  return store;
}
