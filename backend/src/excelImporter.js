import xlsx from 'xlsx';

export function importWorkbookPair(adminPath, userPath) {
  const admin = xlsx.readFile(adminPath, { cellDates: true });
  const user = xlsx.readFile(userPath, { cellDates: true });
  const teams = parseTeams(admin.Sheets.Equipos || user.Sheets.Equipos);
  const matches = parseMatches(admin.Sheets.WORLDCUP || user.Sheets.WORLDCUP);
  const scoringRules = parseRules(admin.Sheets.ADMIN);
  const specialPredictions = parseSpecial(admin.Sheets.ADMIN);
  return {
    metadata: {
      title: readCell(admin.Sheets.Home, 'B3') || 'Porra Mundial 2026',
      sourceAdmin: adminPath,
      sourceUser: userPath,
      generatedAt: new Date().toISOString(),
      firstKickoff: matches[0]?.kickoff || null,
      maxParticipants: Number(readCell(admin.Sheets.ADMIN, 'D5') || 5)
    },
    teams,
    matches,
    scoringRules,
    specialPredictions,
    settings: {
      registrationOpen: true,
      predictionDeadline: matches[0]?.kickoff || null,
      resultsPollMinutes: Number(process.env.RESULTS_POLL_MINUTES || 15),
      allowAdminRuleEditing: true
    }
  };
}

function parseTeams(sheet) {
  const rows = sheetToRows(sheet);
  const header = rows[0] || [];
  const idx = indexMap(header);
  return rows.slice(1)
    .filter((r) => r[idx.Num] && r[idx.NombreEquipo])
    .map((r) => ({
      id: Number(r[idx.Num]),
      name: String(r[idx.NombreEquipo]),
      group: String(r[idx.Grupo] || ''),
      rank: Number(r[idx.Rank] || 0),
      flag: String(r[11] || '')
    }));
}

function parseMatches(sheet) {
  const rows = sheetToRows(sheet);
  const matches = [];
  rows.forEach((row, zeroIndex) => {
    const id = Number(row[33]);
    const kickoff = normalizeDate(row[23]);
    const homeTeam = row[26];
    const awayTeam = row[31];
    if (!Number.isFinite(id) || !kickoff || !homeTeam || !awayTeam || homeTeam === 'Casa') return;
    matches.push({
      id,
      excelRow: zeroIndex + 1,
      phase: phaseFor(id),
      group: id <= 72 ? 'ABCDEFGHIJKL'[Math.floor((id - 1) / 6)] : null,
      round: String(row[25] || ''),
      homeTeam: String(homeTeam),
      awayTeam: String(awayTeam),
      homeFlag: String(row[27] || ''),
      awayFlag: String(row[30] || ''),
      kickoff,
      status: 'scheduled',
      homeScore: integerOrNull(row[28]),
      awayScore: integerOrNull(row[29])
    });
  });
  return matches.sort((a, b) => a.id - b.id);
}

function parseRules(sheet) {
  if (!sheet) return [];
  const rows = sheetToRows(sheet);
  return rows.slice(6, 59)
    .filter((r) => r[2])
    .map((r, i) => ({
      key: slug(r[2]),
      label: String(r[2]),
      points: Number(r[3] || 0),
      excelCell: `ADMIN!D${i + 7}`
    }));
}

function parseSpecial(sheet) {
  if (!sheet) return [];
  const rows = sheetToRows(sheet);
  return rows.slice(129, 258)
    .filter((r) => r[10])
    .map((r, i) => ({
      id: `special-${i + 130}`,
      label: String(r[10]),
      reference: String(r[12] || ''),
      phase: String(r[7] || '')
    }));
}

function sheetToRows(sheet) {
  return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
}

function readCell(sheet, address) {
  return sheet?.[address]?.v;
}

function indexMap(header) {
  return Object.fromEntries(header.map((name, index) => [String(name), index]));
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function integerOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function slug(value) {
  return String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function phaseFor(id) {
  if (id <= 72) return 'Fase de grupos';
  if (id <= 88) return 'Dieciseisavos';
  if (id <= 96) return 'Octavos';
  if (id <= 100) return 'Cuartos';
  if (id <= 102) return 'Semifinales';
  return '3-4 & Final';
}
