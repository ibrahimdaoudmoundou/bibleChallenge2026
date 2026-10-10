// Outils partagés de l'administration

export const dayKey = (date, tz) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

// « cameroun », « Cameroun », « CAMEROUN » → même groupe
export const normKey = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

// Regroupe et compte : [{ key, label, value }] trié par nombre décroissant
export function groupCount(list, get) {
  const m = new Map();
  for (const x of list) {
    const raw = String(get(x) || '').trim();
    const k = normKey(raw);
    if (!k) continue;
    const cur = m.get(k);
    if (cur) cur.value += 1; else m.set(k, { key: k, label: raw, value: 1 });
  }
  return [...m.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'));
}

export const pct = (p, total) => (total ? Math.round((100 * (p.chap_lus || 0)) / total) : 0);

const byLast = (a, b) => String(a.dernier_rapport || '9').localeCompare(String(b.dernier_rapport || '9'));

// Critères de tri. rank = true : utilisable pour un classement / podium
export const SORTS = {
  avance: {
    label: 'Les plus avancés', rank: true,
    cmp: (a, b) => b.chap_lus - a.chap_lus || b.completes - a.completes || byLast(a, b),
    value: (p, total) => `${p.chap_lus} chapitres (${pct(p, total)} %)`,
  },
  regulier: {
    label: 'Les plus réguliers', rank: true,
    cmp: (a, b) => (b.jours_actifs || 0) - (a.jours_actifs || 0) || b.chap_lus - a.chap_lus,
    value: (p) => `${p.jours_actifs || 0} jour${(p.jours_actifs || 0) > 1 ? 's' : ''} avec rapport`,
  },
  rapports: {
    label: 'Le plus de rapports', rank: true,
    cmp: (a, b) => (b.nb_rapports || 0) - (a.nb_rapports || 0) || b.chap_lus - a.chap_lus,
    value: (p) => `${p.nb_rapports || 0} rapport${(p.nb_rapports || 0) > 1 ? 's' : ''}`,
  },
  retard: { label: 'Les plus en retard', cmp: (a, b) => b.retard - a.retard || a.chap_lus - b.chap_lus },
  nom: { label: 'Nom (A → Z)', cmp: (a, b) => a.name.localeCompare(b.name, 'fr') },
  code: { label: 'Identifiant', cmp: (a, b) => a.code.localeCompare(b.code) },
  recent: { label: 'Inscription la plus récente', cmp: (a, b) => String(b.created_at).localeCompare(String(a.created_at)) },
};

export const place = (lieu) => [lieu.city, lieu.country].filter(Boolean).join(', ');

export const ACTIONS = {
  participant_ajoute: 'A ajouté un participant',
  participant_modifie: 'A modifié un participant',
  participant_supprime: 'A supprimé un participant',
  rapport_saisi: 'A saisi un rapport',
  rapport_supprime: 'A supprimé un rapport',
  code_secret_efface: 'A effacé un code secret',
  question_traitee: 'A marqué une question comme traitée',
  question_rouverte: 'A rouvert une question',
  page_publique_modifiee: 'A modifié la page publique',
  annonce_publiee: 'A publié une annonce',
  annonce_retiree: 'A retiré l\'annonce',
  session_creee: 'A créé une session',
  session_modifiee: 'A modifié les réglages de la session',
  session_copiee: 'A créé une session par copie',
};

const DETAIL_LABELS = {
  participant: 'Participant', portion: 'Portion', chapitres: 'Chapitres', date: 'Date de lecture', du: 'Rapport du',
  telephone: 'Téléphone', rapports: 'Rapports supprimés', texte: 'Texte', photo: 'Photo', session: 'Session', depuis: 'Copiée depuis',
};

const ORDER = ['participant', 'portion', 'chapitres', 'date', 'du', 'telephone', 'rapports', 'session', 'depuis', 'photo', 'texte'];
export const detailText = (d) => Object.entries(d || {})
  .sort(([a], [b]) => (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99)
  .filter(([, v]) => v !== null && v !== '')
  .map(([k, v]) => {
    let val = v;
    if ((k === 'du' || k === 'date') && typeof v === 'string') val = new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString('fr-FR');
    return `${DETAIL_LABELS[k] || k} : ${val}`;
  }).join(' · ');

// Redimensionne une photo dans le navigateur (JPEG, 900 px max) avant l'envoi
export function resizeImage(file, max = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
