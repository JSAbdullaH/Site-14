const MINUTE = 60_000;

const CORRECTABLE = ['first_seen', 'last_seen', 'worked_minutes'];

function sessionEnd(session) {
  return session.endedAt || session.lastReadingAt || session.startedAt;
}

function dayAttendance(sessions) {
  if (!sessions.length) {
    return { first_seen: null, last_seen: null, worked_minutes: 0, open: false };
  }
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  let total = 0;
  let until = null;
  for (const s of sorted) {
    const end = sessionEnd(s);
    const from = until && s.startedAt < until ? until : s.startedAt;
    if (end > from) total += Math.round((end - from) / MINUTE);
    if (!until || end > until) until = end;
  }
  return {
    first_seen: sorted[0].startedAt,
    last_seen: until,
    worked_minutes: total,
    open: sorted.some((s) => !s.endedAt),
  };
}

function applyCorrections(original, corrections) {
  const result = {};
  for (const field of CORRECTABLE) {
    const latest = corrections.filter((c) => c.field === field).pop();
    const value = latest ? latest.correctedValue : original[field];
    result[field] = {
      original: original[field],
      value: field === 'worked_minutes' && latest ? Number(value) : value,
      corrected: Boolean(latest),
    };
  }
  return result;
}

module.exports = { CORRECTABLE, sessionEnd, dayAttendance, applyCorrections };
