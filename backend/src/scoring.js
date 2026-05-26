function outcome(home, away) {
  if (home == null || away == null) return null;
  if (home > away) return '1';
  if (home < away) return '2';
  return 'X';
}

function rulePoints(rules, contains, fallback = 0) {
  const rule = rules.find((r) => r.label.toLowerCase().includes(contains));
  return Number(rule?.points ?? fallback) || 0;
}

export function scorePrediction(match, prediction, rules) {
  if (!prediction || match.homeScore == null || match.awayScore == null) return { points: 0, hits: [] };
  const predictedOutcome = outcome(prediction.homeScore, prediction.awayScore);
  const realOutcome = outcome(match.homeScore, match.awayScore);
  let points = 0;
  const hits = [];

  if (prediction.homeScore === match.homeScore && prediction.awayScore === match.awayScore) {
    const exact = rulePoints(rules, 'resultado exacto');
    points += exact;
    hits.push({ type: 'exact', points: exact });
    return { points, hits };
  }

  if (predictedOutcome === realOutcome) {
    const sign = rulePoints(rules, 'signo 1x2');
    points += sign;
    hits.push({ type: 'winner', points: sign });
    const predictedDiff = Math.abs(prediction.homeScore - prediction.awayScore);
    const realDiff = Math.abs(match.homeScore - match.awayScore);
    if (predictedDiff === realDiff) {
      const diff = rulePoints(rules, 'diferencia');
      points += diff;
      hits.push({ type: 'difference', points: diff });
    }
  }
  return { points, hits };
}

export function recalculateScores(db) {
  const users = db.users.filter((u) => u.role !== 'admin');
  const rows = users.map((user) => {
    let points = 0;
    const recentHits = [];
    for (const match of db.matches) {
      const prediction = db.predictions.find((p) => p.userId === user.id && p.matchId === match.id);
      const scored = scorePrediction(match, prediction, db.scoringRules);
      points += scored.points;
      if (scored.points > 0) recentHits.push({ matchId: match.id, points: scored.points, hits: scored.hits });
    }
    return { userId: user.id, name: user.name, points, recentHits: recentHits.slice(-5) };
  }).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const leader = rows[0]?.points || 0;
  db.ranking = rows.map((row, index) => ({
    ...row,
    position: index + 1,
    gap: leader - row.points
  }));
  return db.ranking;
}
