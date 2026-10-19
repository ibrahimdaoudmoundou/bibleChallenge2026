// Répartition automatique d'un nombre de chapitres sur les portions, dans l'ordre de lecture du participant.
// Même règle que la fonction app_private.report_spread côté base (aperçu avant envoi).
export function spreadChapters({ order, byN, lect, chapters, depart }) {
  let left = Math.max(0, Math.floor(Number(chapters) || 0));
  const parts = [];
  let remainingTotal = 0;
  for (const n of order || []) {
    const c = byN[n]?.chapters || 0;
    remainingTotal += Math.max(0, c - Math.min(c, (lect || {})[n] || 0));
  }
  for (const seg of readingSegments({ order, byN, lect, depart })) {
    if (left <= 0) break;
    if (seg.lu >= seg.cap) continue;
    const take = Math.min(left, seg.cap - seg.lu);
    parts.push({ n: seg.n, label: seg.label, chapters: take, total: seg.cap, deja: seg.lu, complete: seg.lu + take >= seg.cap, part: seg.part });
    left -= take;
  }
  return { parts, remainingTotal, overflow: left };
}

// Segments de lecture dans l'ordre du participant. Départ au milieu d'une portion (depart.offset > 0) :
// la première portion est coupée — son début ouvre le parcours, son reste le termine (même règle que la base).
export function readingSegments({ order, byN, lect, depart }) {
  const off = depart && depart.offset > 0 && order && order[0] === depart.n ? depart.offset : 0;
  const segs = [];
  (order || []).forEach((n, i) => {
    const c = byN[n]?.chapters || 0;
    const lu = Math.min(c, (lect || {})[n] || 0);
    if (off && i === 0) {
      const head = c - off;
      segs.push({ n, label: depart.head_label || byN[n]?.label || '', cap: head, lu: Math.min(lu, head), part: 'head' });
    } else {
      segs.push({ n, label: byN[n]?.label || '', cap: c, lu, part: '' });
    }
  });
  if (off) {
    const n = order[0];
    const c = byN[n]?.chapters || 0;
    const lu = Math.min(c, (lect || {})[n] || 0);
    segs.push({ n, label: depart.tail_label || '', cap: off, lu: Math.max(0, lu - (c - off)), part: 'tail' });
  }
  return segs;
}

// Jours du challenge qu'on peut choisir (aujourd'hui en premier, puis les jours passés)
export function reportDays(startISO, totalDays, timezone) {
  let today;
  try { today = new Date().toLocaleDateString('en-CA', { timeZone: timezone || 'Africa/Douala' }); } catch { today = new Date().toISOString().slice(0, 10); }
  const start = new Date(`${String(startISO).slice(0, 10)}T12:00:00Z`);
  const now = new Date(`${today}T12:00:00Z`);
  const j = Math.round((now - start) / 86400000) + 1;
  const last = Math.min(j, totalDays || j);
  const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const out = [];
  for (let d = last; d >= 1; d--) {
    const dt = new Date(start.getTime() + (d - 1) * 86400000);
    const iso = dt.toISOString().slice(0, 10);
    const when = iso === today ? 'Aujourd\'hui' : d === j - 1 ? 'Hier' : fmt.format(dt).replace(/^./, (x) => x.toUpperCase());
    out.push({ iso, day: d, label: `${when} — jour ${d}`, today: iso === today });
  }
  return { today, days: out };
}
