// Textes WhatsApp et utilitaires partagés (navigateur + e-mails automatiques)

export const VERSETS = [
  ["Ta parole est une lampe à mes pieds, et une lumière sur mon sentier.", "Psaume 119:105"],
  ["L'homme ne vivra pas de pain seulement, mais de toute parole qui sort de la bouche de Dieu.", "Matthieu 4:4"],
  ["Ne nous lassons pas de faire le bien ; car nous moissonnerons au temps convenable, si nous ne nous relâchons pas.", "Galates 6:9"],
  ["Je puis tout par celui qui me fortifie.", "Philippiens 4:13"],
  ["L'herbe sèche, la fleur tombe ; mais la parole de notre Dieu subsiste éternellement.", "Ésaïe 40:8"],
  ["Mettez en pratique la parole, et ne vous bornez pas à l'écouter.", "Jacques 1:22"],
  ["Ainsi la foi vient de ce qu'on entend, et ce qu'on entend vient de la parole de Christ.", "Romains 10:17"],
  ["Heureux l'homme qui trouve son plaisir dans la loi de l'Éternel, et qui la médite jour et nuit !", "d'après Psaume 1:1-2"],
];

export const STATUT_LABELS = {
  termine: "🏆 Terminé",
  pas_commence: "⏳ Pas encore commencé",
  aucun: "⚪ Aucun rapport",
  a_jour: "✅ À jour",
  leger: "🟡 Léger retard",
  retard: "🔴 En retard",
};

export const waLink = (phone, text) =>
  "https://wa.me/" + String(phone || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(text);

export const waShare = (text) => "https://wa.me/?text=" + encodeURIComponent(text);

export const portionLabel = (n, label) => `P${n} — ${label}`;

const sig = (c) => (String(c.signature || "").trim() ? `\n\n— _${String(c.signature).trim()}_` : "");
const slog = (c) => (String(c.slogan || "").trim() ? `\n_${String(c.slogan).trim()}_` : "");
const lien = (c) => c.platform_url || "";

// Annonce du matin (s = résumé de la session renvoyé par la base)
export function morningText(s) {
  const c = s.challenge, jour = s.jour, total = c.total_days;
  const v = VERSETS[(Math.max(jour, 1) - 1) % VERSETS.length];
  const url = lien(c) || "[lien de la plateforme]";
  let t;
  if (jour < 1) {
    t = `📖 *${c.name}*${slog(c)}\n\n⏳ Plus que *${1 - jour} jour(s)* avant le début !\n\nPas encore de compte ? Créez-le maintenant (2 minutes) :\n👉 ${url}`;
  } else if ((c.catchup_days || []).includes(jour)) {
    t = `☀️ *Jour ${jour}/${total} — Jour de rattrapage* 🔄\n\nPas de nouvelle portion aujourd'hui. Rattrapez votre retard sur la plateforme (une portion entière ou quelques chapitres).\nVous êtes à jour ? Relisez un passage qui vous a marqué. 🙏\n\n👉 ${url}`;
  } else {
    t = `☀️ *Jour ${jour}/${total}* — Bonne lecture à tous ! 📖${slog(c)}\n\n👉 Ouvrez la plateforme : votre *portion du jour* s'y affiche.\n📝 Après votre lecture, envoyez votre rapport au même endroit :\n${url}\n\n💬 « ${v[0]} » (${v[1]})`;
  }
  if (c.plan_url) t += `\n\n📄 Plan de lecture : ${c.plan_url}`;
  return t + sig(c);
}

// Bilan du soir
export function eveningText(s) {
  const c = s.challenge, jour = s.jour, total = c.total_days;
  const ps = s.participants || [];
  const n = ps.length;
  const pct = (x) => (n ? Math.round((100 * x) / n) : 0);
  const ajour = ps.filter((p) => p.statut === "a_jour" || p.statut === "termine").length;
  const termines = ps.filter((p) => p.statut === "termine").length;
  const lus = ps.reduce((a, p) => a + (p.chap_lus || 0), 0);
  const auj = ps.filter((p) => p.rapport_aujourdhui).length;
  const v = VERSETS[(Math.max(jour, 1) + 3) % VERSETS.length];
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: c.timezone, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  let t = `🌙 *${c.name} — Bilan du jour ${jour}/${total}*${slog(c)}\n${date}\n\n` +
    `👥 Participants : ${n}\n` +
    `📝 Rapports envoyés aujourd'hui : ${auj} (${pct(auj)} %)\n` +
    `✅ À jour : ${ajour} (${pct(ajour)} %)\n` +
    `📚 Progression globale : ${n && s.total_chapters ? Math.round((100 * lus) / (n * s.total_chapters)) : 0} % de la Bible lue (${lus} chapitres)\n`;
  if (termines) t += `🏆 Bible terminée : ${termines} personne(s) !\n`;
  if ((c.catchup_days || []).includes(jour + 1)) t += `\n🔄 *Demain : jour de rattrapage* — l'occasion de vous remettre à jour !\n`;
  if (jour === total) t += `\n🎉 *Dernier jour du challenge !* Merci à chacun pour sa fidélité. Gloire à Dieu ! 🙏\n`;
  t += `\n💬 « ${v[0]} » (${v[1]})\n\n📝 Pas encore envoyé votre rapport ? Il est encore temps :\n👉 ${lien(c)}`;
  return t + sig(c);
}

// Message de relance pour une personne
export function reminderText(p, s) {
  const c = s.challenge;
  const next = p.next
    ? `${portionLabel(p.next.n, p.next.label)}${p.next.deja ? ` (déjà ${p.next.deja}/${p.next.chapters} chapitres)` : ""}`
    : "—";
  return `Bonjour ${p.first_name} 🙂 Petit mot d'encouragement du ${c.name} 📖\n` +
    `Vous avez lu ${p.chap_lus} chapitres sur ${s.total_chapters}. Votre prochaine lecture : ${next}.\n` +
    `Les jours de rattrapage sont là pour vous aider. Envoyez votre rapport ici :\n${lien(c)}\nCourage, on lit ensemble ! 🙏` + sig(c);
}

export const needsReminder = (p) => ["retard", "aucun", "leger"].includes(p.statut) && !!p.phone;
