import fs from 'node:fs/promises';
import path from 'node:path';
import { importWorkbookPair } from '../backend/src/excelImporter.js';

const [adminPath, userPath] = process.argv.slice(2);
if (!adminPath || !userPath) {
  console.error('Uso: npm run import:excel -- <ADMIN.xlsx> <USUARIO.xlsx>');
  process.exit(1);
}

const root = process.cwd();
const seed = importWorkbookPair(adminPath, userPath);
await fs.mkdir(path.join(root, 'database'), { recursive: true });
await fs.writeFile(path.join(root, 'database', 'seed.json'), JSON.stringify(seed, null, 2), 'utf8');
console.log(`Importados ${seed.teams.length} equipos y ${seed.matches.length} partidos.`);
