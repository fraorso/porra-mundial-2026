import fs from 'node:fs/promises';
import { recalculateScores } from '../backend/src/scoring.js';

const seed = JSON.parse(await fs.readFile('database/seed.json', 'utf8'));
if (seed.teams.length !== 48) throw new Error(`Se esperaban 48 equipos, hay ${seed.teams.length}.`);
if (seed.matches.length !== 104) throw new Error(`Se esperaban 104 partidos, hay ${seed.matches.length}.`);
const db = { ...seed, users: [], predictions: [], ranking: [] };
recalculateScores(db);
console.log('Smoke test OK:', seed.metadata.title, `${seed.matches.length} partidos`);
