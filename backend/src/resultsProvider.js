export async function fetchResults(db) {
  const provider = process.env.RESULTS_PROVIDER || 'mock';
  if (provider === 'mock') return 0;

  if (provider === 'football-data') {
    const apiKey = process.env.RESULTS_API_KEY;
    if (!apiKey) return 0;
    const response = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': apiKey }
    });
    if (!response.ok) return 0;
    const payload = await response.json();
    let changed = 0;
    for (const apiMatch of payload.matches || []) {
      const local = db.matches.find((m) =>
        namesClose(m.homeTeam, apiMatch.homeTeam?.name) && namesClose(m.awayTeam, apiMatch.awayTeam?.name)
      );
      if (!local) continue;
      const full = apiMatch.score?.fullTime;
      const nextStatus = mapStatus(apiMatch.status);
      if (full && (local.homeScore !== full.home || local.awayScore !== full.away || local.status !== nextStatus)) {
        local.homeScore = full.home;
        local.awayScore = full.away;
        local.status = nextStatus;
        changed += 1;
      }
    }
    return changed;
  }
  return 0;
}

function namesClose(a = '', b = '') {
  const clean = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  return clean(a).includes(clean(b).slice(0, 6)) || clean(b).includes(clean(a).slice(0, 6));
}

function mapStatus(status) {
  if (status === 'FINISHED') return 'finished';
  if (['IN_PLAY', 'PAUSED'].includes(status)) return 'live';
  return 'scheduled';
}
