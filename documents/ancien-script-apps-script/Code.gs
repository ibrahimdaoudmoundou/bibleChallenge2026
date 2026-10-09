/**
 * ==================================================================
 *  CHALLENGE BIBLE 40 JOURS — Plateforme + suivi automatique
 *  Version centralisée (sans sous-groupes)
 * ------------------------------------------------------------------
 *  À coller dans : Google Sheets > Extensions > Apps Script
 *  1) Menu « 📖 Challenge Bible » > « 1. Installer »
 *  2) Déployer > Nouveau déploiement > Application Web (voir le guide)
 * ------------------------------------------------------------------
 *  Ce script fournit :
 *   - une PLATEFORME (un seul lien pour tout le monde) où chacun
 *     crée son compte (téléphone + code secret) puis envoie ses
 *     rapports quand il veut, depuis son téléphone ;
 *   - le calcul automatique de la progression de chacun ;
 *   - des e-mails automatiques à l'administration : annonce du matin,
 *     bilan du soir (bouton « Ouvrir dans WhatsApp ») et liste des
 *     personnes à relancer (boutons de rappel WhatsApp).
 * ==================================================================
 */

// ---------- Paramètres fixes ----------
const JOURS_TOTAL = 40;
const JOURS_RATTRAPAGE = [13, 26, 40];   // pas de nouvelle portion ces jours-là
const NB_PORTIONS = 37;
// Identifiant du Google Sheet : la partie de son adresse située entre /d/ et /edit
// Obligatoire si le script n'a pas été créé via Extensions > Apps Script depuis le Sheet.
const ID_DU_SHEET = "";
// Plusieurs administrateurs : séparer les adresses par des virgules
const ADMIN_PAR_DEFAUT = "ibrahimdaoudmoundou2026@gmail.com, meponsime@gmail.com, Bahaesther2@gmail.com, gotiertoue1@gmail.com, bethelepie0@gmail.com";
const SIGNATURE_PAR_DEFAUT = "Challenge organisé par Mary Epie Fomum";
const SLOGAN_PAR_DEFAUT = "Finir l'année 2026 en beauté ✨";
const DEBUT_PAR_DEFAUT = new Date(2026, 9, 12);  // lundi 12 octobre 2026 (mois 9 = octobre) : le jour 40 tombe le vendredi 20 novembre 2026

// Versets d'encouragement (Louis Segond 1910), utilisés à tour de rôle
const VERSETS = [
  ["Ta parole est une lampe à mes pieds, et une lumière sur mon sentier.", "Psaume 119:105"],
  ["L'homme ne vivra pas de pain seulement, mais de toute parole qui sort de la bouche de Dieu.", "Matthieu 4:4"],
  ["Ne nous lassons pas de faire le bien ; car nous moissonnerons au temps convenable, si nous ne nous relâchons pas.", "Galates 6:9"],
  ["Je puis tout par celui qui me fortifie.", "Philippiens 4:13"],
  ["L'herbe sèche, la fleur tombe ; mais la parole de notre Dieu subsiste éternellement.", "Ésaïe 40:8"],
  ["Mettez en pratique la parole, et ne vous bornez pas à l'écouter.", "Jacques 1:22"],
  ["Ainsi la foi vient de ce qu'on entend, et ce qu'on entend vient de la parole de Christ.", "Romains 10:17"],
  ["Heureux l'homme qui trouve son plaisir dans la loi de l'Éternel, et qui la médite jour et nuit !", "d'après Psaume 1:1-2"],
];

// ---------- Onglets ----------
const SH = {
  CONFIG: "Config", PLAN: "Plan", PART: "Participants", RAP: "Rapports",
  DASH: "Tableau de bord", BILAN: "Bilan WhatsApp", QUESTIONS: "Questions",
};

// ---------- Colonnes de Participants (1 = A) ----------
const PC = { ID:1, NOM:2, TEL:3, DEPART:4, INSCRIT:5, PIN:6, JETON:7, LISTE:8, CHAP:9, LUES:10,
             ATTENDUES:11, RETARD:12, STATUT:13, PROCHAINE:14, DERNIER:15, AUJOURDHUI:16 };
const P_HEADERS = ["ID","Nom","Téléphone","Départ (n° portion)","Date d'inscription","Code (protégé)","Jeton (protégé)",
  "Lecture par portion (portion:chapitres)","Chapitres lus","Portions complètes","Portions attendues","Retard (chapitres)","Statut","Prochaine portion",
  "Dernier rapport","Rapport aujourd'hui"];

// ---------- Colonnes de Rapports ----------
const R_HEADERS = ["Horodatage","ID","Nom","N° portion","Portion","Chapitres lus","Verset marquant","Ce que j'ai appris","Application","Question"];

// ---------- Lignes de Config ----------
const C = {
  NOM: "Nom du challenge",
  SLOGAN: "Slogan",
  DEBUT: "Date de début (jour 1)",
  ADMIN: "E-mail de l'administration",
  INDICATIF: "Indicatif pays par défaut",
  H_MATIN: "Heure de l'annonce du matin (0-23)",
  H_BILAN: "Heure du bilan du soir (0-23)",
  J_RELANCE: "Jour de la liste des relances (1=lundi … 7=dimanche)",
  H_RELANCE: "Heure de la liste des relances (0-23)",
  LIEN: "Lien de la plateforme (à coller après le déploiement)",
  L_PLAN: "Lien du plan de lecture PDF (facultatif)",
  SIGNATURE: "Signature des messages",
};


const PLAN = [
  {n:1, t:"AT", ref:"Genèse 1-27", ch:27, livre:"Genèse", chap:1},
  {n:2, t:"AT", ref:"Genèse 28-50 ; Exode 1-4", ch:27, livre:"Genèse", chap:28},
  {n:3, t:"AT", ref:"Exode 5-31", ch:27, livre:"Exode", chap:5},
  {n:4, t:"AT", ref:"Exode 32-40 ; Lévitique 1-18", ch:27, livre:"Exode", chap:32},
  {n:5, t:"AT", ref:"Lévitique 19-27 ; Nombres 1-15", ch:24, livre:"Lévitique", chap:19},
  {n:6, t:"AT", ref:"Nombres 16-36", ch:21, livre:"Nombres", chap:16},
  {n:7, t:"AT", ref:"Deutéronome 1-34", ch:34, livre:"Deutéronome", chap:1},
  {n:8, t:"AT", ref:"Josué 1-24 ; Juges 1-3", ch:27, livre:"Josué", chap:1},
  {n:9, t:"AT", ref:"Juges 4-21 ; Ruth 1-4 ; 1 Samuel 1-9", ch:31, livre:"Juges", chap:4},
  {n:10, t:"AT", ref:"1 Samuel 10-31 ; 2 Samuel 1-8", ch:30, livre:"1 Samuel", chap:10},
  {n:11, t:"AT", ref:"2 Samuel 9-24 ; 1 Rois 1-10", ch:26, livre:"2 Samuel", chap:9},
  {n:12, t:"AT", ref:"1 Rois 11-22 ; 2 Rois 1-13", ch:25, livre:"1 Rois", chap:11},
  {n:13, t:"AT", ref:"2 Rois 14-25 ; 1 Chroniques 1-15", ch:27, livre:"2 Rois", chap:14},
  {n:14, t:"AT", ref:"1 Chroniques 16-29 ; 2 Chroniques 1-17", ch:31, livre:"1 Chroniques", chap:16},
  {n:15, t:"AT", ref:"2 Chroniques 18-36 ; Esdras 1-10 ; Néhémie 1-3", ch:32, livre:"2 Chroniques", chap:18},
  {n:16, t:"AT", ref:"Néhémie 4-13 ; Esther 1-10 ; Job 1-14", ch:34, livre:"Néhémie", chap:4},
  {n:17, t:"AT", ref:"Job 15-42 ; Psaumes 1-7", ch:35, livre:"Job", chap:15},
  {n:18, t:"AT", ref:"Psaumes 8-57", ch:50, livre:"Psaumes", chap:8},
  {n:19, t:"AT", ref:"Psaumes 58-108", ch:51, livre:"Psaumes", chap:58},
  {n:20, t:"AT", ref:"Psaumes 109-150 ; Proverbes 1-4", ch:46, livre:"Psaumes", chap:109},
  {n:21, t:"AT", ref:"Proverbes 5-31", ch:27, livre:"Proverbes", chap:5},
  {n:22, t:"AT", ref:"Ecclésiaste 1-12 ; Cantique des cantiques 1-8 ; Ésaïe 1-27", ch:47, livre:"Ecclésiaste", chap:1},
  {n:23, t:"AT", ref:"Ésaïe 28-66", ch:39, livre:"Ésaïe", chap:28},
  {n:24, t:"AT", ref:"Jérémie 1-34", ch:34, livre:"Jérémie", chap:1},
  {n:25, t:"AT", ref:"Jérémie 35-52 ; Lamentations 1-5 ; Ézéchiel 1-8", ch:31, livre:"Jérémie", chap:35},
  {n:26, t:"AT", ref:"Ézéchiel 9-39", ch:31, livre:"Ézéchiel", chap:9},
  {n:27, t:"AT", ref:"Ézéchiel 40-48 ; Daniel 1-12 ; Osée 1-14 ; Joël 1-3", ch:38, livre:"Ézéchiel", chap:40},
  {n:28, t:"AT", ref:"Amos 1-9 ; Abdias ; Jonas 1-4 ; Michée 1-7 ; Nahum 1-3 ; Habakuk 1-3 ; Sophonie 1-3 ; Aggée 1-2 ; Zacharie 1-14 ; Malachie 1-4", ch:50, livre:"Amos", chap:1},
  {n:29, t:"NT", ref:"Matthieu 1-23", ch:23, livre:"Matthieu", chap:1},
  {n:30, t:"NT", ref:"Matthieu 24-28 ; Marc 1-16", ch:21, livre:"Matthieu", chap:24},
  {n:31, t:"NT", ref:"Luc 1-19", ch:19, livre:"Luc", chap:1},
  {n:32, t:"NT", ref:"Luc 20-24 ; Jean 1-15", ch:20, livre:"Luc", chap:20},
  {n:33, t:"NT", ref:"Jean 16-21 ; Actes 1-18", ch:24, livre:"Jean", chap:16},
  {n:34, t:"NT", ref:"Actes 19-28 ; Romains 1-16 ; 1 Corinthiens 1-3", ch:29, livre:"Actes", chap:19},
  {n:35, t:"NT", ref:"1 Corinthiens 4-16 ; 2 Corinthiens 1-13 ; Galates 1-6 ; Éphésiens 1-6", ch:38, livre:"1 Corinthiens", chap:4},
  {n:36, t:"NT", ref:"Philippiens 1-4 ; Colossiens 1-4 ; 1 Thessaloniciens 1-5 ; 2 Thessaloniciens 1-3 ; 1 Timothée 1-6 ; 2 Timothée 1-4 ; Tite 1-3 ; Philémon ; Hébreux 1-13", ch:43, livre:"Philippiens", chap:1},
  {n:37, t:"NT", ref:"Jacques 1-5 ; 1 Pierre 1-5 ; 2 Pierre 1-3 ; 1 Jean 1-5 ; 2 Jean ; 3 Jean ; Jude ; Apocalypse 1-22", ch:43, livre:"Jacques", chap:1},
];
const LIVRES = [
  ["Genèse", 50],
  ["Exode", 40],
  ["Lévitique", 27],
  ["Nombres", 36],
  ["Deutéronome", 34],
  ["Josué", 24],
  ["Juges", 21],
  ["Ruth", 4],
  ["1 Samuel", 31],
  ["2 Samuel", 24],
  ["1 Rois", 22],
  ["2 Rois", 25],
  ["1 Chroniques", 29],
  ["2 Chroniques", 36],
  ["Esdras", 10],
  ["Néhémie", 13],
  ["Esther", 10],
  ["Job", 42],
  ["Psaumes", 150],
  ["Proverbes", 31],
  ["Ecclésiaste", 12],
  ["Cantique des cantiques", 8],
  ["Ésaïe", 66],
  ["Jérémie", 52],
  ["Lamentations", 5],
  ["Ézéchiel", 48],
  ["Daniel", 12],
  ["Osée", 14],
  ["Joël", 3],
  ["Amos", 9],
  ["Abdias", 1],
  ["Jonas", 4],
  ["Michée", 7],
  ["Nahum", 3],
  ["Habakuk", 3],
  ["Sophonie", 3],
  ["Aggée", 2],
  ["Zacharie", 14],
  ["Malachie", 4],
  ["Matthieu", 28],
  ["Marc", 16],
  ["Luc", 24],
  ["Jean", 21],
  ["Actes", 28],
  ["Romains", 16],
  ["1 Corinthiens", 16],
  ["2 Corinthiens", 13],
  ["Galates", 6],
  ["Éphésiens", 6],
  ["Philippiens", 4],
  ["Colossiens", 4],
  ["1 Thessaloniciens", 5],
  ["2 Thessaloniciens", 3],
  ["1 Timothée", 6],
  ["2 Timothée", 4],
  ["Tite", 3],
  ["Philémon", 1],
  ["Hébreux", 13],
  ["Jacques", 5],
  ["1 Pierre", 5],
  ["2 Pierre", 3],
  ["1 Jean", 5],
  ["2 Jean", 1],
  ["3 Jean", 1],
  ["Jude", 1],
  ["Apocalypse", 22]
];


const TOTAL_CHAP = PLAN.reduce((s, p) => s + p.ch, 0);   // 1 189 chapitres
const SEUIL_LEGER_ = Math.round(2 * TOTAL_CHAP / NB_PORTIONS);   // « léger retard » = jusqu'à environ 2 portions

// ==================================================================
//  PLATEFORME WEB (ce que voient les participants)
// ==================================================================
function doGet() {
  return HtmlService.createHtmlOutput(pageHtml_())
    .setTitle(getConfig_()[C.NOM] || "Challenge Bible 40 jours")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Informations générales pour l'application. */
function api_info() {
  const cfg = getConfig_(), tz = tz_();
  const jour = jourDuChallenge_(new Date(), cfg, tz);
  const d0 = cfg[C.DEBUT] instanceof Date ? cfg[C.DEBUT] : new Date(cfg[C.DEBUT]);
  return {
    nom: cfg[C.NOM] || "Challenge Bible 40 jours",
    nbPortions: NB_PORTIONS,
    slogan: String(cfg[C.SLOGAN] || ""),
    signature: String(cfg[C.SIGNATURE] || ""),
    jour: jour, total: JOURS_TOTAL, totalChap: TOTAL_CHAP,
    debut: isNaN(d0.getTime()) ? "" : Utilities.formatDate(d0, tz, "dd/MM/yyyy"),
    rattrapage: JOURS_RATTRAPAGE.indexOf(jour) !== -1,
    plan: PLAN.map(p => libellePortion_(p.n)),
    chapitres: PLAN.map(p => p.ch),
    livres: LIVRES.map(l => l[0]),
    lienPlan: String(cfg[C.L_PLAN] || ""),
  };
}

/** Création de compte (le code secret est facultatif). */
function api_inscription(d) {
  d = d || {};
  const nom = nettoyer_(d.nom, 80);
  const pin = String(d.pin || "").replace(/\D/g, "");
  if (nom.length < 3) return { erreur: "Merci d'indiquer votre nom et prénom." };
  if (pin && pin.length !== 4) return { erreur: "Le code secret doit contenir 4 chiffres (ou laissez la case vide)." };
  const tel = normaliserTel_(d.tel, String(getConfig_()[C.INDICATIF] || "").replace(/\D/g, ""));
  if (tel.length < 8) return { erreur: "Numéro de téléphone invalide. Exemple : +237 6 99 12 34 56" };
  const depart = portionDeDepart_(d.depart, d.livre, d.chap);
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const sh = feuille_(SH.PART);
    const n = sh.getLastRow() - 1;
    const v = n > 0 ? sh.getRange(2, 1, n, PC.JETON).getValues() : [];
    if (v.some(r => String(r[PC.TEL - 1]) === tel))
      return { erreur: "Ce numéro a déjà un compte. Utilisez « J'ai déjà un compte » pour vous connecter." };
    const max = v.reduce((m, r) => Math.max(m, Number(String(r[0]).replace(/\D/g, "")) || 0), 0);
    const id = "CB" + ("000" + (max + 1)).slice(-4);
    const jeton = Utilities.getUuid();
    const ligne = n + 2;
    sh.getRange(ligne, 1, 1, PC.LISTE).setValues([[id, nom, tel, depart, new Date(), pin ? hash_(pin) : "", jeton, ""]]);
    calculerLigne_(sh, ligne);
    return { ok: true, jeton: jeton, profil: profilLigne_(sh, ligne) };
  } finally { lock.releaseLock(); }
}

/** Connexion : numéro seul, ou numéro + code si le compte en a un. */
function api_connexion(d) {
  d = d || {};
  const tel = normaliserTel_(d.tel, String(getConfig_()[C.INDICATIF] || "").replace(/\D/g, ""));
  const pin = String(d.pin || "").replace(/\D/g, "");
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const sh = feuille_(SH.PART);
    const ligne = trouverLigne_(sh, PC.TEL, tel);
    if (!ligne) return { erreur: "Aucun compte avec ce numéro. Vérifiez le numéro ou créez votre compte." };
    const enregistre = String(sh.getRange(ligne, PC.PIN).getValue());
    if (enregistre) {
      if (!pin) return { erreur: "Ce compte est protégé par un code secret : entrez votre code à 4 chiffres.", besoinCode: true };
      if (enregistre !== hash_(pin)) return { erreur: "Code secret incorrect.", besoinCode: true };
    } else if (pin.length === 4) {
      sh.getRange(ligne, PC.PIN).setValue(hash_(pin));     // la personne choisit un code (facultatif)
    }
    let jeton = String(sh.getRange(ligne, PC.JETON).getValue());
    if (!jeton) { jeton = Utilities.getUuid(); sh.getRange(ligne, PC.JETON).setValue(jeton); }
    calculerLigne_(sh, ligne);
    return { ok: true, jeton: jeton, profil: profilLigne_(sh, ligne) };
  } finally { lock.releaseLock(); }
}

/** Profil à partir du jeton mémorisé sur le téléphone. */
function api_profil(jeton) {
  const sh = feuille_(SH.PART);
  const ligne = jeton ? trouverLigne_(sh, PC.JETON, String(jeton)) : 0;
  if (!ligne) return { deconnecte: true };
  return { ok: true, profil: profilLigne_(sh, ligne) };
}

/** Envoi d'un rapport : une portion entière ou seulement quelques chapitres. */
function api_rapport(jeton, d) {
  d = d || {};
  const portion = Number(d.portion);
  if (!(portion >= 1 && portion <= NB_PORTIONS)) return { erreur: "Choisissez la portion lue." };
  const maxCh = PLAN[portion - 1].ch;
  const chap = Math.round(Number(d.chapitres));
  if (!(chap >= 1 && chap <= maxCh)) return { erreur: "Indiquez le nombre de chapitres lus (entre 1 et " + maxCh + ")." };
  const verset = nettoyer_(d.verset, 1500), appris = nettoyer_(d.appris, 3000),
        appli = nettoyer_(d.appli, 3000), question = nettoyer_(d.question, 1500);
  if (!verset || !appris || !appli) return { erreur: "Merci de remplir les trois cases du rapport." };
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const sh = feuille_(SH.PART);
    const ligne = jeton ? trouverLigne_(sh, PC.JETON, String(jeton)) : 0;
    if (!ligne) return { deconnecte: true };
    const id = sh.getRange(ligne, PC.ID).getValue(), nom = sh.getRange(ligne, PC.NOM).getValue();
    feuille_(SH.RAP).appendRow([new Date(), id, nom, portion, libellePortion_(portion), chap, verset, appris, appli, question]);
    const lect = lectures_(sh.getRange(ligne, PC.LISTE).getValue());
    lect[portion] = Math.min(maxCh, (lect[portion] || 0) + chap);
    sh.getRange(ligne, PC.LISTE).setValue(lecturesTexte_(lect));
    calculerLigne_(sh, ligne, true);
    return { ok: true, profil: profilLigne_(sh, ligne) };
  } finally { lock.releaseLock(); }
}

/** Les rapports déjà envoyés par la personne (les 60 derniers). */
function api_mesRapports(jeton) {
  const sh = feuille_(SH.PART);
  const ligne = jeton ? trouverLigne_(sh, PC.JETON, String(jeton)) : 0;
  if (!ligne) return { deconnecte: true };
  const id = String(sh.getRange(ligne, PC.ID).getValue());
  const r = feuille_(SH.RAP); const n = r.getLastRow() - 1;
  if (n < 1) return { ok: true, liste: [] };
  const v = r.getRange(2, 1, n, R_HEADERS.length).getValues().filter(x => String(x[1]) === id).slice(-60).reverse();
  return { ok: true, liste: v.map(x => ({
    date: x[0] instanceof Date ? Utilities.formatDate(x[0], tz_(), "dd/MM HH:mm") : String(x[0]),
    portion: String(x[4]), chapitres: x[5], verset: String(x[6]) })) };
}

// ---------- calculs pour une personne ----------
function calculerLigne_(sh, ligne, rapportMaintenant) {
  const cfg = getConfig_(), tz = tz_();
  const jour = jourDuChallenge_(new Date(), cfg, tz);
  const r = sh.getRange(ligne, 1, 1, P_HEADERS.length).getValues()[0];
  const res = calculer_(lectures_(r[PC.LISTE - 1]), Number(r[PC.DEPART - 1]) || 1, portionsAttendues_(jour));
  const dernier = rapportMaintenant ? new Date() : r[PC.DERNIER - 1];
  const auj = rapportMaintenant ? "✅" : (r[PC.AUJOURDHUI - 1] || "—");
  sh.getRange(ligne, PC.CHAP, 1, 8).setValues([[res.chapLus, res.completes, res.attendues, res.retard, res.statut, res.prochaine, dernier, auj]]);
}

/**
 * lect = { n° portion : chapitres lus }.
 * Le retard est compté en chapitres : chapitres attendus à ce jour (portions du parcours) - chapitres lus.
 */
function calculer_(lect, depart, attendues) {
  const ordre = ordre_(depart);
  let chapLus = 0, completes = 0;
  PLAN.forEach(p => { const c = Math.min(p.ch, lect[p.n] || 0); chapLus += c; if (c >= p.ch) completes++; });
  let chapAttendus = 0;
  for (let k = 0; k < attendues; k++) chapAttendus += PLAN[ordre[k] - 1].ch;
  const retard = Math.max(0, chapAttendus - chapLus);
  let statut;
  if (completes >= NB_PORTIONS) statut = "🏆 Terminé";
  else if (attendues === 0) statut = "⏳ Pas encore commencé";
  else if (chapLus === 0) statut = "⚪ Aucun rapport";
  else if (retard === 0) statut = "✅ À jour";
  else if (retard <= SEUIL_LEGER_) statut = "🟡 Léger retard";
  else statut = "🔴 En retard";
  let prochaine = "—", prochaineN = 0;
  for (const p of ordre) {
    const deja = Math.min(PLAN[p - 1].ch, lect[p] || 0);
    if (deja < PLAN[p - 1].ch) {
      prochaineN = p;
      prochaine = libellePortion_(p) + (deja ? " (déjà " + deja + "/" + PLAN[p - 1].ch + " chapitres)" : "");
      break;
    }
  }
  return { chapLus, completes, attendues, chapAttendus, retard, statut, prochaine, prochaineN };
}

function ordre_(depart) {
  const o = []; for (let k = 0; k < NB_PORTIONS; k++) o.push(((depart - 1 + k) % NB_PORTIONS) + 1);
  return o;
}

function profilLigne_(sh, ligne) {
  const r = sh.getRange(ligne, 1, 1, P_HEADERS.length).getValues()[0];
  const cfg = getConfig_(), tz = tz_();
  const jour = jourDuChallenge_(new Date(), cfg, tz);
  const lect = lectures_(r[PC.LISTE - 1]);
  const depart = Number(r[PC.DEPART - 1]) || 1;
  const res = calculer_(lect, depart, portionsAttendues_(jour));
  return { id: r[0], nom: r[1], prenom: String(r[1]).split(" ")[0], depart, lect, ordre: ordre_(depart),
    protege: !!r[PC.PIN - 1],
    chapLus: res.chapLus, completes: res.completes, attendues: res.attendues, chapAttendus: res.chapAttendus,
    retard: res.retard, statut: res.statut, prochaine: res.prochaine, prochaineN: res.prochaineN, jour,
    rapportAujourdhui: r[PC.AUJOURDHUI - 1] === "✅" &&
      r[PC.DERNIER - 1] instanceof Date && cleJour_(r[PC.DERNIER - 1], tz) === cleJour_(new Date(), tz) };
}

/** "1:18,2:7" <-> {1:18, 2:7} */
function lectures_(s) {
  const o = {};
  String(s || "").split(",").forEach(x => {
    const m = x.split(":"); const p = Number(m[0]);
    if (p >= 1 && p <= NB_PORTIONS) o[p] = Math.min(PLAN[p - 1].ch, m.length > 1 ? Number(m[1]) || 0 : PLAN[p - 1].ch);
  });
  return o;
}
function lecturesTexte_(o) {
  return Object.keys(o).map(Number).sort((a, b) => a - b).filter(p => o[p] > 0).map(p => p + ":" + o[p]).join(",");
}



// ==================================================================
//  MENU ADMINISTRATION
// ==================================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu("📖 Challenge Bible")
    .addItem("1. Installer (une seule fois)", "installer")
    .addSeparator()
    .addItem("Mettre à jour maintenant", "mettreAJour")
    .addItem("Générer le bilan WhatsApp maintenant", "genererBilanManuel")
    .addItem("Recevoir la liste des relances maintenant", "envoyerRelancesManuel")
    .addItem("Tester les e-mails", "testerEmails")
    .addItem("Réinitialiser le code secret d'un participant", "reinitialiserCode")
    .addItem("Réinstaller les envois automatiques (après changement d'heure)", "installerDeclencheurs")
    .addToUi();
}

function installer() {
  const ss = ss_();
  const cfg = feuille_(SH.CONFIG);
  if (cfg.getLastRow() < 2) {
    const lignes = [
      ["Paramètre", "Valeur"],
      [C.NOM, "Challenge Bible 40 jours"],
      [C.SLOGAN, SLOGAN_PAR_DEFAUT],
      [C.DEBUT, DEBUT_PAR_DEFAUT],
      [C.ADMIN, ADMIN_PAR_DEFAUT],
      [C.INDICATIF, "237"],
      [C.H_MATIN, 6],
      [C.H_BILAN, 21],
      [C.J_RELANCE, 1],
      [C.H_RELANCE, 8],
      [C.LIEN, ""],
      [C.L_PLAN, ""],
      [C.SIGNATURE, SIGNATURE_PAR_DEFAUT],
    ];
    cfg.getRange(1, 1, lignes.length, 2).setValues(lignes);
    cfg.getRange("B4").setNumberFormat("dd/MM/yyyy");
    cfg.getRange("B6").setNumberFormat("@");
    cfg.getRange("A1:B1").setFontWeight("bold").setBackground("#1f3864").setFontColor("white");
    cfg.setColumnWidth(1, 420); cfg.setColumnWidth(2, 460);
  }

  const plan = feuille_(SH.PLAN); plan.clear();
  const rows = [["N°", "Testament", "Portion à lire", "Chapitres"]]
    .concat(PLAN.map(p => ["P" + p.n, p.t === "AT" ? "Ancien" : "Nouveau", p.ref, p.ch]));
  plan.getRange(1, 1, rows.length, 4).setValues(rows);
  entete_(plan, 4); plan.setColumnWidth(3, 520); plan.setFrozenRows(1);

  const part = feuille_(SH.PART);
  if (part.getLastRow() < 1) {
    part.getRange(1, 1, 1, P_HEADERS.length).setValues([P_HEADERS]);
    entete_(part, P_HEADERS.length); part.setFrozenRows(1); part.setFrozenColumns(2);
    part.getRange("C:C").setNumberFormat("@"); part.getRange("H:H").setNumberFormat("@");
    part.hideColumns(PC.PIN, 2);
  }
  const rap = feuille_(SH.RAP);
  if (rap.getLastRow() < 1) {
    rap.getRange(1, 1, 1, R_HEADERS.length).setValues([R_HEADERS]);
    entete_(rap, R_HEADERS.length); rap.setFrozenRows(1);
    rap.getRange("A:A").setNumberFormat("dd/MM/yyyy HH:mm");
  }
  const qs = feuille_(SH.QUESTIONS);
  if (qs.getLastRow() < 1) {
    qs.getRange(1, 1, 1, 8).setValues([["Date", "ID", "Nom", "Téléphone", "Portion", "Question", "Réponse", "Répondu ?"]]);
    entete_(qs, 8); qs.setFrozenRows(1); qs.setColumnWidth(6, 400); qs.setColumnWidth(7, 400);
  }
  feuille_(SH.DASH); feuille_(SH.BILAN);

  const props = PropertiesService.getScriptProperties();
  props.setProperty("SS_ID", ss.getId());
  if (!props.getProperty("SEL")) props.setProperty("SEL", Utilities.getUuid());

  [SH.DASH, SH.BILAN, SH.PART, SH.RAP, SH.QUESTIONS, SH.PLAN, SH.CONFIG].forEach((n, i) => {
    ss.setActiveSheet(ss.getSheetByName(n)); ss.moveActiveSheet(i + 1);
  });
  const s1 = ss.getSheetByName("Feuille 1") || ss.getSheetByName("Sheet1");
  if (s1 && s1.getLastRow() === 0) ss.deleteSheet(s1);
  ss.setActiveSheet(ss.getSheetByName(SH.CONFIG));

  installerDeclencheurs();
  calculerTout_();
  alerte_("✅ Installation terminée",
    "Étapes suivantes :\n1) Vérifiez l'onglet Config (date de début, e-mail, indicatif).\n" +
    "2) Publiez la plateforme : Déployer > Nouveau déploiement > Application Web (voir le guide).\n" +
    "3) Collez le lien obtenu dans Config, ligne « Lien de la plateforme ».");
}

function installerDeclencheurs() {
  const gerees = ["mettreAJour", "envoyerAnnonceMatin", "envoyerBilanSoir", "envoyerRelances"];
  ScriptApp.getProjectTriggers().forEach(t => { if (gerees.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t); });
  const cfg = getConfig_();
  const jours = [null, ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.TUESDAY, ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY, ScriptApp.WeekDay.FRIDAY, ScriptApp.WeekDay.SATURDAY, ScriptApp.WeekDay.SUNDAY];
  ScriptApp.newTrigger("mettreAJour").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("envoyerAnnonceMatin").timeBased().everyDays(1).atHour(heure_(cfg[C.H_MATIN], 6)).create();
  ScriptApp.newTrigger("envoyerBilanSoir").timeBased().everyDays(1).atHour(heure_(cfg[C.H_BILAN], 21)).create();
  ScriptApp.newTrigger("envoyerRelances").timeBased().onWeekDay(jours[Number(cfg[C.J_RELANCE])] || ScriptApp.WeekDay.MONDAY)
    .atHour(heure_(cfg[C.H_RELANCE], 8)).create();
}

function reinitialiserCode() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt("Réinitialiser un code secret", "Tapez l'ID du participant (ex. CB0012) :", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const sh = feuille_(SH.PART);
  const ligne = trouverLigne_(sh, PC.ID, r.getResponseText().trim().toUpperCase());
  if (!ligne) { ui.alert("ID introuvable."); return; }
  sh.getRange(ligne, PC.PIN, 1, 2).setValues([["", ""]]);
  ui.alert("✅ Code effacé pour " + sh.getRange(ligne, PC.NOM).getValue() +
    ".\nLa personne se connecte avec son numéro seul. Elle peut taper un nouveau code à 4 chiffres si elle le souhaite (facultatif).");
}

// ==================================================================
//  MISE À JOUR GLOBALE (toutes les heures)
// ==================================================================
function mettreAJour(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return;
  try { calculerTout_(); } finally { lock.releaseLock(); }
}

function calculerTout_() {
  const cfg = getConfig_(), tz = tz_();
  const jour = jourDuChallenge_(new Date(), cfg, tz);
  const attendues = portionsAttendues_(jour);
  const auj = cleJour_(new Date(), tz);
  const rap = rapports_();

  const part = feuille_(SH.PART);
  const n = part.getLastRow() - 1;
  const data = n > 0 ? part.getRange(2, 1, n, P_HEADERS.length).getValues() : [];
  const parId = {};
  rap.forEach(r => {
    const o = parId[r.id] || (parId[r.id] = { lect: {}, dernier: null, auj: false });
    if (r.portion) o.lect[r.portion] = Math.min(PLAN[r.portion - 1].ch, (o.lect[r.portion] || 0) + r.chap);
    if (!o.dernier || r.date > o.dernier) o.dernier = r.date;
    if (r.cle === auj) o.auj = true;
  });
  const sortie = data.map(r => {
    const o = parId[String(r[0])] || { lect: {}, dernier: null, auj: false };
    const res = calculer_(o.lect, Number(r[PC.DEPART - 1]) || 1, attendues);
    return [lecturesTexte_(o.lect), res.chapLus, res.completes, res.attendues, res.retard, res.statut, res.prochaine, o.dernier || "", o.auj ? "✅" : "—"];
  });
  if (n > 0) {
    part.getRange(2, PC.LISTE, n, 9).setValues(sortie);
    part.getRange(2, PC.DERNIER, n, 1).setNumberFormat("dd/MM/yyyy HH:mm");
  }

  ajouterQuestions_(rap, data);

  // ---- tableau de bord
  const total = data.length;
  const compte = s => sortie.filter(x => x[5].indexOf(s) !== -1).length;
  const lusTotal = sortie.reduce((s, x) => s + x[1], 0);   // chapitres
  const rapportsAuj = rap.filter(r => r.cle === auj).length;
  const inscritsAuj = data.filter(r => r[PC.INSCRIT - 1] instanceof Date && cleJour_(r[PC.INSCRIT - 1], tz) === auj).length;
  const dep = { at: data.filter(r => Number(r[PC.DEPART - 1]) === 1).length,
                nt: data.filter(r => Number(r[PC.DEPART - 1]) === PLAN.find(p => p.t === "NT").n).length };
  const dash = feuille_(SH.DASH); dash.clear();
  const lignes = [
    ["📖 " + cfg[C.NOM], String(cfg[C.SLOGAN] || "")],
    ["Mis à jour le", Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm")],
    ["Jour du challenge", jour < 1 ? "Commence dans " + (1 - jour) + " jour(s)" : (jour > JOURS_TOTAL ? "Terminé" : jour + " / " + JOURS_TOTAL + (JOURS_RATTRAPAGE.indexOf(jour) !== -1 ? " (rattrapage)" : ""))],
    ["Portions attendues à ce jour", attendues + " / " + NB_PORTIONS],
    ["Participants inscrits", total],
    ["Nouveaux inscrits aujourd'hui", inscritsAuj],
    ["✅ À jour", compte("À jour") + compte("Terminé")],
    ["🟡 Léger retard", compte("Léger")],
    ["🔴 En retard", compte("En retard")],
    ["⚪ Aucun rapport", compte("Aucun")],
    ["🏆 Bible terminée", compte("Terminé")],
    ["Rapports reçus aujourd'hui", rapportsAuj],
    ["Rapports reçus au total", rap.length],
    ["Chapitres lus au total", lusTotal + " / " + (total * TOTAL_CHAP)],
    ["Progression globale", total ? lusTotal / (total * TOTAL_CHAP) : 0],
    ["Départ : Genèse / Matthieu / autre", dep.at + " / " + dep.nt + " / " + (total - dep.at - dep.nt)],
    ["Questions en attente de réponse", questionsEnAttente_()],
  ];
  dash.getRange(1, 1, lignes.length, 2).setValues(lignes);
  dash.getRange("A1").setFontSize(16).setFontWeight("bold");
  dash.getRange("B15").setNumberFormat("0.0%");
  dash.setColumnWidth(1, 330); dash.setColumnWidth(2, 300);
  return { jour, total, sortie };
}

function ajouterQuestions_(rap, data) {
  const props = PropertiesService.getScriptProperties();
  const deja = Number(props.getProperty("Q_DERNIER_TS") || 0);
  const tel = {}; data.forEach(r => tel[String(r[0])] = r[PC.TEL - 1]);
  const nouv = []; let max = deja;
  rap.forEach(r => {
    const ts = r.date.getTime();
    if (ts > deja && r.question) {
      nouv.push([r.date, r.id, r.nom, tel[r.id] || "", r.libelle, r.question, "", false]);
      max = Math.max(max, ts);
    }
  });
  const qs = feuille_(SH.QUESTIONS);
  if (nouv.length) {
    const debut = qs.getLastRow() + 1;
    qs.getRange(debut, 1, nouv.length, 8).setValues(nouv);
    qs.getRange(debut, 4, nouv.length, 1).setNumberFormat("@");
    qs.getRange(debut, 8, nouv.length, 1).insertCheckboxes();
  }
  props.setProperty("Q_DERNIER_TS", String(max));
}

function questionsEnAttente_() {
  const qs = feuille_(SH.QUESTIONS); const n = qs.getLastRow() - 1;
  if (n < 1) return 0;
  return qs.getRange(2, 8, n, 1).getValues().filter(r => r[0] !== true).length;
}

// ==================================================================
//  E-MAILS À L'ADMINISTRATION (messages WhatsApp prêts à envoyer)
// ==================================================================
function envoyerAnnonceMatin(e) {
  const test = typeof e === "string" ? e : null;
  const cfg = getConfig_(), tz = tz_();
  const jour = jourDuChallenge_(new Date(), cfg, tz);
  if (!test && (jour < -6 || jour > JOURS_TOTAL)) return;
  const v = VERSETS[(Math.max(jour, 1) - 1) % VERSETS.length];
  const lien = String(cfg[C.LIEN] || "[lien de la plateforme]");
  let t;
  if (jour < 1) {
    t = "📖 *" + cfg[C.NOM] + "*" + sloganWa_(cfg) + "\n\n⏳ Plus que *" + (1 - jour) + " jour(s)* avant le début !\n\n" +
        "Pas encore de compte ? Créez-le maintenant (2 minutes) :\n👉 " + lien;
  } else if (JOURS_RATTRAPAGE.indexOf(jour) !== -1) {
    t = "☀️ *Jour " + jour + "/" + JOURS_TOTAL + " — Jour de rattrapage* 🔄\n\n" +
        "Pas de nouvelle portion aujourd'hui. Rattrapez votre retard sur la plateforme (une portion entière ou quelques chapitres).\n" +
        "Vous êtes à jour ? Relisez un passage qui vous a marqué. 🙏\n\n👉 " + lien;
  } else {
    t = "☀️ *Jour " + jour + "/" + JOURS_TOTAL + "* — Bonne lecture à tous ! 📖" + sloganWa_(cfg) + "\n\n" +
        "👉 Ouvrez la plateforme : votre *portion du jour* s'y affiche.\n" +
        "📝 Après votre lecture, envoyez votre rapport au même endroit :\n" + lien + "\n\n" +
        "💬 « " + v[0] + " » (" + v[1] + ")";
  }
  if (cfg[C.L_PLAN]) t += "\n\n📄 Plan de lecture : " + cfg[C.L_PLAN];
  t += signatureWa_(cfg);
  ecrireBilan_(1, "Annonce du matin", t);
  mailWhatsApp_(test || cfg[C.ADMIN], "☀️ Jour " + jour + " — annonce du matin à publier", t);
}

function envoyerBilanSoir(e) {
  const test = typeof e === "string" ? e : null;
  const cfg = getConfig_(), tz = tz_();
  const jour = jourDuChallenge_(new Date(), cfg, tz);
  if (!test && (jour < 1 || jour > JOURS_TOTAL)) return;
  mettreAJour();
  mailWhatsApp_(test || cfg[C.ADMIN], "🌙 Jour " + jour + " — bilan du soir à publier", texteBilan_());
}

function genererBilanManuel() {
  mettreAJour(); texteBilan_();
  ss_().setActiveSheet(feuille_(SH.BILAN));
  SpreadsheetApp.getUi().alert("Le bilan est prêt dans l'onglet « Bilan WhatsApp ». Cliquez sur le lien pour l'ouvrir dans WhatsApp.");
}

function texteBilan_() {
  const cfg = getConfig_(), tz = tz_();
  const jour = jourDuChallenge_(new Date(), cfg, tz);
  const part = feuille_(SH.PART); const n = part.getLastRow() - 1;
  const data = n > 0 ? part.getRange(2, 1, n, P_HEADERS.length).getValues() : [];
  const total = data.length;
  const ajour = data.filter(r => /À jour|Terminé/.test(r[PC.STATUT - 1])).length;
  const termines = data.filter(r => /Terminé/.test(r[PC.STATUT - 1])).length;
  const lus = data.reduce((s, r) => s + (Number(r[PC.CHAP - 1]) || 0), 0);   // chapitres
  const auj = data.filter(r => r[PC.AUJOURDHUI - 1] === "✅").length;
  const pct = x => total ? Math.round(100 * x / total) : 0;
  const v = VERSETS[(Math.max(jour, 1) + 3) % VERSETS.length];
  let t = "🌙 *" + cfg[C.NOM] + " — Bilan du jour " + jour + "/" + JOURS_TOTAL + "*" + sloganWa_(cfg) + "\n" +
    Utilities.formatDate(new Date(), tz, "dd/MM/yyyy") + "\n\n" +
    "👥 Participants : " + total + "\n" +
    "📝 Rapports envoyés aujourd'hui : " + auj + " (" + pct(auj) + " %)\n" +
    "✅ À jour : " + ajour + " (" + pct(ajour) + " %)\n" +
    "📚 Progression globale : " + (total ? Math.round(100 * lus / (total * TOTAL_CHAP)) : 0) + " % de la Bible lue (" + lus + " chapitres)\n";
  if (termines) t += "🏆 Bible terminée : " + termines + " personne(s) !\n";
  if (JOURS_RATTRAPAGE.indexOf(jour + 1) !== -1) t += "\n🔄 *Demain : jour de rattrapage* — l'occasion de vous remettre à jour !\n";
  if (jour === JOURS_TOTAL) t += "\n🎉 *Dernier jour du challenge !* Merci à chacun pour sa fidélité. Gloire à Dieu ! 🙏\n";
  t += "\n💬 « " + v[0] + " » (" + v[1] + ")\n\n" +
    "📝 Pas encore envoyé votre rapport ? Il est encore temps :\n👉 " + String(cfg[C.LIEN] || "");
  t += signatureWa_(cfg);
  ecrireBilan_(5, "Bilan du soir", t);
  return t;
}

/** Liste des personnes à relancer, avec un bouton WhatsApp de rappel pour chacune. */
function envoyerRelances(e) {
  const test = typeof e === "string" ? e : null;
  const cfg = getConfig_(), tz = tz_();
  const jour = jourDuChallenge_(new Date(), cfg, tz);
  if (!test && (jour < 2 || jour > JOURS_TOTAL + 3)) return;
  if (!test) mettreAJour();
  const part = feuille_(SH.PART); const n = part.getLastRow() - 1;
  const data = n > 0 ? part.getRange(2, 1, n, P_HEADERS.length).getValues() : [];
  const lien = String(cfg[C.LIEN] || "");
  const aRelancer = data.filter(r => /En retard|Aucun rapport|Léger/.test(r[PC.STATUT - 1]) && r[PC.TEL - 1])
    .sort((a, b) => (Number(b[PC.RETARD - 1]) || 0) - (Number(a[PC.RETARD - 1]) || 0));
  const PAR_MAIL = 100;
  const parties = Math.max(1, Math.ceil(aRelancer.length / PAR_MAIL));
  for (let k = 0; k < parties; k++) {
    const lot = aRelancer.slice(k * PAR_MAIL, (k + 1) * PAR_MAIL);
    let html = "<div style='font-family:Arial,sans-serif;font-size:15px'><h2 style='color:#1f3864'>🔔 Personnes à relancer — jour " + jour +
      (parties > 1 ? " (partie " + (k + 1) + "/" + parties + ")" : "") + "</h2>" +
      "<p>" + aRelancer.length + " personne(s) au total. Touchez un nom depuis votre téléphone : WhatsApp s'ouvre avec un rappel déjà écrit. " +
      "Vous pouvez répartir les parties entre les administrateurs.</p><ol start='" + (k * PAR_MAIL + 1) + "'>";
    lot.forEach(r => {
      const msg = "Bonjour " + String(r[PC.NOM - 1]).split(" ")[0] + " 🙂 Petit mot d'encouragement du " + cfg[C.NOM] + " 📖\n" +
        "Vous avez lu " + r[PC.CHAP - 1] + " chapitres sur " + TOTAL_CHAP + ". Votre prochaine lecture : " + r[PC.PROCHAINE - 1] + ".\n" +
        "Les jours de rattrapage sont là pour vous aider. Envoyez votre rapport ici :\n" + lien + "\nCourage, on lit ensemble ! 🙏" + signatureWa_(cfg);
      html += "<li style='margin:6px 0'><a href='" + lienWa_(r[PC.TEL - 1], msg) + "'>" + esc_(r[PC.NOM - 1]) + "</a> — " +
        esc_(r[PC.STATUT - 1]) + " (" + r[PC.RETARD - 1] + " chapitres de retard)</li>";
    });
    if (!lot.length) html += "<p>Personne à relancer. Bravo à tous ! 🎉</p>";
    html += "</ol></div>";
    MailApp.sendEmail({ to: test || cfg[C.ADMIN], htmlBody: html,
      subject: "🔔 Jour " + jour + " — " + aRelancer.length + " personne(s) à relancer" + (parties > 1 ? " (" + (k + 1) + "/" + parties + ")" : "") });
  }
}

function envoyerRelancesManuel() {
  envoyerRelances(String(getConfig_()[C.ADMIN]));
  SpreadsheetApp.getUi().alert("Liste des relances envoyée à " + getConfig_()[C.ADMIN]);
}

function testerEmails() {
  const moi = String(getConfig_()[C.ADMIN]);
  mettreAJour();
  envoyerAnnonceMatin(moi); envoyerBilanSoir(moi); envoyerRelances(moi);
  SpreadsheetApp.getUi().alert("3 e-mails de test envoyés à " + moi + " (annonce, bilan, relances).");
}



// ==================================================================
//  OUTILS
// ==================================================================
function rapports_() {
  const sh = ss_().getSheetByName(SH.RAP);
  if (!sh || sh.getLastRow() < 2) return [];
  const tz = tz_();
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, R_HEADERS.length).getValues();
  const out = [];
  v.forEach(r => {
    const date = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (!r[1] || isNaN(date.getTime())) return;
    out.push({ date, cle: cleJour_(date, tz), id: String(r[1]).trim().toUpperCase(), nom: r[2],
      portion: (Number(r[3]) >= 1 && Number(r[3]) <= NB_PORTIONS) ? Number(r[3]) : 0, libelle: r[4],
      chap: Number(r[5]) > 0 ? Number(r[5]) : ((Number(r[3]) >= 1 && Number(r[3]) <= NB_PORTIONS) ? PLAN[Number(r[3]) - 1].ch : 0),
      question: String(r[9] || "").trim() });
  });
  return out;
}

function trouverLigne_(sh, col, valeur) {
  const n = sh.getLastRow() - 1; if (n < 1 || !valeur) return 0;
  const v = sh.getRange(2, col, n, 1).getValues();
  for (let i = 0; i < n; i++) if (String(v[i][0]) === String(valeur)) return i + 2;
  return 0;
}


function portionDeDepart_(choix, livre, chap) {
  if (choix === "nt") return PLAN.find(p => p.t === "NT").n;
  if (choix !== "ici" || !livre) return 1;
  const pos = positionGlobale_(String(livre), Number(chap) || 1);
  let res = 1;
  PLAN.forEach(p => { if (positionGlobale_(p.livre, p.chap) <= pos) res = p.n; });
  return res;
}

function positionGlobale_(livre, chap) {
  let pos = 0;
  for (const l of LIVRES) { if (l[0] === livre) return pos + Math.min(Math.max(chap, 1), l[1]); pos += l[1]; }
  return 1;
}

function libellePortion_(n) { const p = PLAN[n - 1]; return p ? "P" + p.n + " — " + p.ref : ""; }

function jourDuChallenge_(date, cfg, tz) {
  const d0 = cfg[C.DEBUT] instanceof Date ? cfg[C.DEBUT] : new Date(cfg[C.DEBUT]);
  if (isNaN(d0.getTime())) return 0;
  const a = cleJour_(d0, tz).split("-").map(Number), b = cleJour_(date, tz).split("-").map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000) + 1;
}

function portionsAttendues_(jour) {
  if (jour < 1) return 0;
  const j = Math.min(jour, JOURS_TOTAL);
  return Math.min(NB_PORTIONS, j - JOURS_RATTRAPAGE.filter(r => r <= j).length);
}

function cleJour_(d, tz) { return Utilities.formatDate(d, tz, "yyyy-MM-dd"); }
function tz_() { return ss_().getSpreadsheetTimeZone(); }
function heure_(v, def) { const h = Number(v); return h >= 0 && h <= 23 && String(v) !== "" ? h : def; }

function normaliserTel_(t, ind) {
  let s = String(t || "").trim();
  const plus = s.charAt(0) === "+";
  s = s.replace(/\D/g, "");
  if (!s) return "";
  if (s.indexOf("00") === 0) return s.slice(2);
  if (plus) return s;
  if (ind === "225" && s.length === 10) return ind + s;       // Côte d'Ivoire : le 0 fait partie du numéro
  if (ind && s.charAt(0) === "0") return ind + s.slice(1);
  if (ind && s.indexOf(ind) !== 0 && s.length <= 10) return ind + s;
  return s;
}

function hash_(pin) {
  const sel = PropertiesService.getScriptProperties().getProperty("SEL") || "";
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sel + "|" + pin, Utilities.Charset.UTF_8));
}

function nettoyer_(s, max) {
  let t = String(s == null ? "" : s).trim().slice(0, max);
  if (/^[=+\-@]/.test(t)) t = "'" + t;      // empêche l'interprétation comme formule
  return t;
}

function signatureWa_(cfg) { const s = String(cfg[C.SIGNATURE] || "").trim(); return s ? "\n\n— _" + s + "_" : ""; }

function sloganWa_(cfg) { const s = String(cfg[C.SLOGAN] || "").trim(); return s ? "\n_" + s + "_" : ""; }

function lienWa_(tel, texte) { return "https://wa.me/" + String(tel).replace(/\D/g, "") + "?text=" + encodeURIComponent(texte); }

function ecrireBilan_(ligne, titre, texte) {
  const sh = feuille_(SH.BILAN);
  sh.getRange(ligne, 1).setValue(titre + " (" + Utilities.formatDate(new Date(), tz_(), "dd/MM HH:mm") + ")").setFontWeight("bold");
  sh.getRange(ligne + 1, 1).setValue(texte).setWrap(true).setVerticalAlignment("top");
  sh.getRange(ligne + 2, 1).setRichTextValue(SpreadsheetApp.newRichTextValue().setText("👉 Ouvrir dans WhatsApp")
    .setLinkUrl("https://wa.me/?text=" + encodeURIComponent(texte)).build());
  sh.setColumnWidth(1, 520);
}

function mailWhatsApp_(to, sujet, texte) {
  if (!to) return;
  const html = "<div style='font-family:Arial,sans-serif;font-size:15px'>" +
    "<p><a href='https://wa.me/?text=" + encodeURIComponent(texte) + "' style='display:inline-block;background:#25D366;color:#fff;" +
    "padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold'>📲 Ouvrir dans WhatsApp</a></p>" +
    "<p style='color:#555'>Touchez le bouton depuis votre téléphone, choisissez le grand groupe, puis appuyez sur Envoyer.</p>" +
    "<pre style='white-space:pre-wrap;background:#f4f4f4;padding:12px;border-radius:8px;font-family:Arial,sans-serif'>" + esc_(texte) + "</pre>" +
    "<p style='color:#888;font-size:12px'>" + esc_(getConfig_()[C.SIGNATURE]) + "</p></div>";
  MailApp.sendEmail({ to: to, subject: sujet, htmlBody: html });
}

function getConfig_() {
  const sh = ss_().getSheetByName(SH.CONFIG);
  const o = {};
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => o[r[0]] = r[1]);
  if (!o[C.ADMIN]) o[C.ADMIN] = ADMIN_PAR_DEFAUT;
  if (o[C.SIGNATURE] === undefined) o[C.SIGNATURE] = SIGNATURE_PAR_DEFAUT;
  if (o[C.SLOGAN] === undefined) o[C.SLOGAN] = SLOGAN_PAR_DEFAUT;
  return o;
}

function feuille_(nom) { const ss = ss_(); return ss.getSheetByName(nom) || ss.insertSheet(nom); }
function entete_(sh, nb) { sh.getRange(1, 1, 1, nb).setFontWeight("bold").setBackground("#1f3864").setFontColor("white").setWrap(true); }
function esc_(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/\n/g, "<br>"); }


function ss_() {
  const actif = SpreadsheetApp.getActiveSpreadsheet();
  if (actif) return actif;
  const id = String(ID_DU_SHEET || "").trim() || PropertiesService.getScriptProperties().getProperty("SS_ID");
  if (!id) throw new Error("Google Sheet introuvable : collez son identifiant dans ID_DU_SHEET (en haut du fichier Code.gs).");
  return SpreadsheetApp.openById(id);
}

/** À lancer une fois depuis l'éditeur si le script n'est pas lié au Sheet : crée la clé de protection des codes secrets. */
function preparer() {
  const p = PropertiesService.getScriptProperties();
  const id = String(ID_DU_SHEET || "").trim();
  if (id) p.setProperty("SS_ID", id);
  if (!p.getProperty("SEL")) p.setProperty("SEL", Utilities.getUuid());
  Logger.log("OK. Sheet : " + ss_().getName());
}

/** Alerte qui ne plante pas quand on lance depuis l'éditeur (hors Sheet). */
function alerte_(titre, message) {
  try { SpreadsheetApp.getUi().alert(titre, message, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { Logger.log(titre + " — " + message); }
}

// ==================================================================
//  PAGE DE LA PLATEFORME (HTML)
// ==================================================================
function pageHtml_() {
  return `<!DOCTYPE html>
<html lang="fr"><head><base target="_top"><meta charset="utf-8">
<style>
:root{--bleu:#1f3864;--or:#c9a227;--creme:#faf7ee;--vert:#2e7d32;--rouge:#c62828;--gris:#666}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f3f4f8;color:#222;font-size:17px}
header{background:var(--bleu);color:#fff;padding:18px 16px 14px;text-align:center}
header h1{margin:0;font-size:21px}
header p{margin:4px 0 0;color:#f0dfa0;font-size:14px}
main{max-width:520px;margin:0 auto;padding:14px}
.carte{background:#fff;border-radius:14px;padding:18px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
h2{color:var(--bleu);font-size:19px;margin:0 0 12px}
label{display:block;font-weight:600;margin:14px 0 6px;font-size:15px}
input,select,textarea{width:100%;font-size:17px;padding:12px;border:1.5px solid #cfd3dc;border-radius:10px;background:#fff;font-family:inherit}
textarea{min-height:88px;resize:vertical}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--bleu)}
.aide{font-size:13px;color:var(--gris);margin-top:4px}
button{width:100%;font-size:18px;font-weight:700;padding:15px;border:0;border-radius:12px;margin-top:16px;cursor:pointer}
.principal{background:var(--bleu);color:#fff}
.secondaire{background:#e8ebf3;color:var(--bleu)}
.lien{background:none;color:var(--bleu);text-decoration:underline;font-weight:500;font-size:15px;padding:8px}
button:disabled{opacity:.6}
.choix label{display:flex;align-items:center;gap:10px;font-weight:500;border:1.5px solid #cfd3dc;border-radius:10px;padding:12px;margin:8px 0}
.choix input{width:auto;margin:0}
.erreur{background:#fdecea;color:var(--rouge);padding:12px;border-radius:10px;margin-top:12px;display:none}
.succes{background:#e8f5e9;color:var(--vert);padding:14px;border-radius:10px;margin-bottom:14px;font-weight:600;display:none}
.jour{font-size:15px;color:var(--gris)}
.aujourdhui{background:var(--creme);border-left:5px solid var(--or);padding:14px;border-radius:10px;margin:12px 0}
.aujourdhui b{color:var(--bleu);font-size:19px;display:block;margin-top:4px}
.barre{height:14px;background:#e3e6ee;border-radius:7px;overflow:hidden;margin:8px 0}
.barre div{height:100%;background:linear-gradient(90deg,var(--or),#e3c157)}
.stats{display:flex;justify-content:space-between;font-size:15px}
.statut{display:inline-block;padding:6px 12px;border-radius:20px;background:#eef1f7;font-weight:600;font-size:15px;margin-top:6px}
.grille{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:10px}
.grille span{text-align:center;padding:8px 0;border-radius:8px;font-size:13px;background:#eef1f7;color:#555}
.grille span.ok{background:var(--vert);color:#fff}
.grille span.part{background:#f0dfa0;color:#5a4a00}
.grille span.next{outline:2px solid var(--or);font-weight:700}
.slogan{font-size:15px;color:#fff;font-style:italic;margin-top:6px}
.histo div{border-bottom:1px solid #eee;padding:10px 0;font-size:15px}
.histo small{color:var(--gris)}
.cache{display:none}
.centre{text-align:center}
.chargement{text-align:center;padding:40px 10px;color:var(--gris)}
</style></head>
<body>
<header><h1 id="titre">📖 Challenge Bible 40 jours</h1><div class="slogan" id="slogan">Finir l'année 2026 en beauté ✨</div><p id="soustitre">Challenge organisé par Mary Epie Fomum</p></header>
<main>
  <div id="chargement" class="chargement">Chargement…</div>

  <!-- ACCUEIL -->
  <section id="e-accueil" class="cache">
    <div class="carte centre">
      <h2>Bienvenue ! 🙌</h2>
      <p>Lisez toute la Bible avec nous et envoyez votre rapport chaque jour, ici même.</p>
      <button class="principal" onclick="ecran('inscription')">Créer mon compte</button>
      <button class="secondaire" onclick="ecran('connexion')">J'ai déjà un compte</button>
    </div>
  </section>

  <!-- INSCRIPTION -->
  <section id="e-inscription" class="cache">
    <div class="carte">
      <h2>Créer mon compte</h2>
      <label>Nom et prénom</label><input id="i-nom" autocomplete="name">
      <label>Numéro WhatsApp</label><input id="i-tel" type="tel" placeholder="+237 6 99 12 34 56">
      <div class="aide">Avec l'indicatif du pays de préférence.</div>
      <label>Code secret (facultatif, 4 chiffres)</label><input id="i-pin" type="password" inputmode="numeric" maxlength="4" oninput="majPin()">
      <div class="aide">Vous pouvez laisser vide. Avec un code, personne d'autre ne pourra se connecter avec votre numéro.</div>
      <div id="i-pin2-bloc" class="cache"><label>Confirmez le code secret</label><input id="i-pin2" type="password" inputmode="numeric" maxlength="4"></div>
      <label>Par où voulez-vous commencer ?</label>
      <div class="choix">
        <label><input type="radio" name="dep" value="at" checked onchange="majDepart()"> Au début de l'Ancien Testament (Genèse)</label>
        <label><input type="radio" name="dep" value="nt" onchange="majDepart()"> Au début du Nouveau Testament (Matthieu)</label>
        <label><input type="radio" name="dep" value="ici" onchange="majDepart()"> Là où j'en suis dans ma lecture</label>
      </div>
      <div id="i-ici" class="cache">
        <label>Livre actuel</label><select id="i-livre"></select>
        <label>Chapitre actuel</label><input id="i-chap" type="number" inputmode="numeric" min="1" max="150" value="1">
      </div>
      <div id="i-err" class="erreur"></div>
      <button class="principal" id="i-btn" onclick="inscrire()">Créer mon compte</button>
      <button class="lien" onclick="ecran('accueil')">← Retour</button>
    </div>
  </section>

  <!-- CONNEXION -->
  <section id="e-connexion" class="cache">
    <div class="carte">
      <h2>Me connecter</h2>
      <label>Numéro WhatsApp</label><input id="c-tel" type="tel" placeholder="+237 6 99 12 34 56">
      <label>Code secret <span style="font-weight:400">(seulement si vous en avez choisi un)</span></label><input id="c-pin" type="password" inputmode="numeric" maxlength="4">
      <div class="aide">Pas de code ? Laissez vide. Code oublié ? Contactez l'administration du challenge.</div>
      <div id="c-err" class="erreur"></div>
      <button class="principal" id="c-btn" onclick="connecter()">Me connecter</button>
      <button class="lien" onclick="ecran('accueil')">← Retour</button>
    </div>
  </section>

  <!-- MON ESPACE -->
  <section id="e-espace" class="cache">
    <div id="s-ok" class="succes"></div>
    <div class="carte">
      <h2 id="s-bonjour">Bonjour</h2>
      <div class="jour" id="s-jour"></div>
      <div class="aujourdhui"><span id="s-lbl">À lire maintenant :</span><b id="s-prochaine"></b></div>
      <div class="stats"><span>Ma progression</span><span id="s-compte"></span></div>
      <div class="barre"><div id="s-barre" style="width:0"></div></div>
      <div class="aide" id="s-portions"></div>
      <span class="statut" id="s-statut"></span>
      <button class="principal" onclick="ouvrirRapport()">📝 Envoyer mon rapport</button>
    </div>
    <div class="carte">
      <h2>Mon parcours</h2>
      <div class="aide">Dans l'ordre de lecture, à partir de mon point de départ. En vert : portions terminées. En jaune : commencées.</div>
      <div class="grille" id="s-grille"></div>
      <button class="secondaire" onclick="voirHisto()">Voir mes rapports envoyés</button>
      <div id="s-plan"></div>
    </div>
    <div class="carte centre aide">
      Astuce : ajoutez cette page à l'écran d'accueil de votre téléphone (menu ⋮ ou ⎙ du navigateur).<br>
      <button class="lien" onclick="deconnecter()">Me déconnecter</button>
    </div>
  </section>

  <!-- RAPPORT -->
  <section id="e-rapport" class="cache">
    <div class="carte">
      <h2>📝 Mon rapport</h2>
      <label>Quelle portion avez-vous lue ?</label><select id="r-portion" onchange="majChapitres()"></select>
      <label>Combien de chapitres avez-vous lus ?</label><select id="r-chap"></select>
      <div class="aide" id="r-deja"></div>
      <label>Le verset qui m'a marqué</label><textarea id="r-verset" placeholder="Référence et texte du verset"></textarea>
      <label>Ce que j'ai appris</label><textarea id="r-appris"></textarea>
      <label>Comment je vais l'appliquer</label><textarea id="r-appli"></textarea>
      <label>Une question sur ma lecture ? (facultatif)</label><textarea id="r-question" style="min-height:60px"></textarea>
      <div id="r-err" class="erreur"></div>
      <button class="principal" id="r-btn" onclick="envoyerRapport()">Envoyer mon rapport</button>
      <button class="lien" onclick="ecran('espace')">← Retour</button>
    </div>
  </section>

  <!-- HISTORIQUE -->
  <section id="e-histo" class="cache">
    <div class="carte">
      <h2>Mes rapports envoyés</h2>
      <div class="histo" id="h-liste">Chargement…</div>
      <button class="secondaire" onclick="ecran('espace')">← Retour</button>
    </div>
  </section>
  <footer id="pied" style="text-align:center;color:#888;font-size:13px;padding:6px 0 24px">Challenge organisé par Mary Epie Fomum</footer>
</main>

<script>
var INFO = null, PROFIL = null, JETON = null;
var CLE = "cb40_jeton";
function $(id){ return document.getElementById(id); }
function lireJeton(){ try { return localStorage.getItem(CLE); } catch(e){ return null; } }
function ecrireJeton(j){ try { if (j) localStorage.setItem(CLE, j); else localStorage.removeItem(CLE); } catch(e){} }
function ecran(nom){
  ["accueil","inscription","connexion","espace","rapport","histo"].forEach(function(n){ $("e-"+n).className = (n===nom) ? "" : "cache"; });
  $("chargement").className = "cache"; window.scrollTo(0,0);
}
function erreur(id, msg){ var e=$(id); e.textContent = msg; e.style.display = msg ? "block" : "none"; }
function texte(s){ var d=document.createElement("div"); d.textContent = s==null ? "" : String(s); return d.innerHTML; }

/* Appel serveur avec nouvelles tentatives (beaucoup de monde le soir) */
function appel(fn, args, ok, ko, essai){
  essai = essai || 0;
  var r = google.script.run.withSuccessHandler(ok).withFailureHandler(function(err){
    if (essai < 3) setTimeout(function(){ appel(fn, args, ok, ko, essai+1); }, 1500 + Math.random()*2500*(essai+1));
    else ko("Connexion difficile, merci de réessayer dans un instant.");
  });
  r[fn].apply(r, args);
}

function demarrer(){
  appel("api_info", [], function(info){
    INFO = info;
    $("titre").textContent = "📖 " + info.nom;
    $("slogan").textContent = info.slogan || "";
    $("soustitre").textContent = info.signature || "Toute la Bible en 40 jours";
    $("pied").textContent = info.signature || "";
    var sel = $("i-livre");
    info.livres.forEach(function(l){ var o=document.createElement("option"); o.value=l; o.textContent=l; sel.appendChild(o); });
    JETON = lireJeton();
    if (JETON) {
      appel("api_profil", [JETON], function(r){ if (r && r.ok) { PROFIL=r.profil; afficherEspace(); } else { ecrireJeton(null); ecran("accueil"); } },
        function(){ ecran("accueil"); });
    } else ecran("accueil");
  }, function(m){ $("chargement").textContent = m; });
}

function majDepart(){
  var v = document.querySelector("input[name=dep]:checked").value;
  $("i-ici").className = v === "ici" ? "" : "cache";
}

function majPin(){ $("i-pin2-bloc").className = $("i-pin").value ? "" : "cache"; }

function inscrire(){
  erreur("i-err","");
  var pin=$("i-pin").value.trim(), pin2=$("i-pin2").value.trim();
  if (pin && !/^\\d{4}$/.test(pin)) return erreur("i-err","Le code secret doit contenir 4 chiffres, ou laissez la case vide.");
  if (pin && pin !== pin2) return erreur("i-err","Les deux codes ne sont pas identiques.");
  var d = { nom:$("i-nom").value, tel:$("i-tel").value, pin:pin,
    depart:document.querySelector("input[name=dep]:checked").value, livre:$("i-livre").value, chap:$("i-chap").value };
  $("i-btn").disabled = true; $("i-btn").textContent = "Création…";
  appel("api_inscription", [d], function(r){
    $("i-btn").disabled = false; $("i-btn").textContent = "Créer mon compte";
    if (r.erreur) return erreur("i-err", r.erreur);
    JETON = r.jeton; ecrireJeton(JETON); PROFIL = r.profil;
    afficherEspace(pin ? "✅ Votre compte est créé ! Gardez bien votre code secret." : "✅ Votre compte est créé ! Pour vous reconnecter, il suffira de votre numéro.");
  }, function(m){ $("i-btn").disabled=false; $("i-btn").textContent="Créer mon compte"; erreur("i-err", m); });
}

function connecter(){
  erreur("c-err","");
  $("c-btn").disabled = true; $("c-btn").textContent = "Connexion…";
  appel("api_connexion", [{ tel:$("c-tel").value, pin:$("c-pin").value }], function(r){
    $("c-btn").disabled = false; $("c-btn").textContent = "Me connecter";
    if (r.erreur) return erreur("c-err", r.erreur);
    JETON = r.jeton; ecrireJeton(JETON); PROFIL = r.profil; afficherEspace();
  }, function(m){ $("c-btn").disabled=false; $("c-btn").textContent="Me connecter"; erreur("c-err", m); });
}

function deconnecter(){ ecrireJeton(null); JETON=null; PROFIL=null; ecran("accueil"); }

function afficherEspace(msg){
  var p = PROFIL;
  $("s-bonjour").textContent = "Bonjour " + p.prenom + " 👋";
  var j = p.jour;
  $("s-jour").textContent = j < 1 ? "Le challenge commence le " + INFO.debut + ". Vous pouvez déjà commencer !"
    : (j > INFO.total ? "Le challenge est terminé. Vous pouvez continuer à votre rythme."
    : "Jour " + j + " / " + INFO.total + (INFO.rattrapage ? " — jour de rattrapage 🔄" : "") + " · votre identifiant : " + p.id);
  var fini = p.completes >= INFO.nbPortions;
  $("s-lbl").textContent = fini ? "Bravo !" : (p.rapportAujourdhui ? "Rapport du jour envoyé ✅ — prochaine lecture :" : "À lire maintenant :");
  $("s-prochaine").textContent = fini ? "Vous avez lu toute la Bible ! 🏆" : p.prochaine;
  $("s-compte").textContent = p.chapLus + " / " + INFO.totalChap + " chapitres";
  $("s-barre").style.width = Math.round(100*p.chapLus/INFO.totalChap) + "%";
  $("s-portions").textContent = p.completes + " portion(s) terminée(s) sur " + INFO.nbPortions + " · " + Math.round(100*p.chapLus/INFO.totalChap) + " % de la Bible";
  $("s-statut").textContent = p.statut + (p.retard > 0 ? " (" + p.retard + " chapitres à rattraper)" : "");
  var g = $("s-grille"); g.innerHTML = "";
  p.ordre.forEach(function(n){
    var s = document.createElement("span"); s.textContent = "P" + n;
    var d = p.lect[n] || 0, ch = INFO.chapitres[n-1];
    if (d >= ch) s.className = "ok"; else if (n === p.prochaineN) s.className = d ? "part next" : "next"; else if (d) s.className = "part";
    g.appendChild(s);
  });
  $("s-plan").innerHTML = INFO.lienPlan ? '<button class="lien" onclick="window.open(\\'' + INFO.lienPlan.replace(/'/g,"") + '\\',\\'_blank\\')">📄 Voir le plan de lecture</button>' : "";
  var ok = $("s-ok"); ok.textContent = msg || ""; ok.style.display = msg ? "block" : "none";
  ecran("espace");
}

function ouvrirRapport(){
  var sel = $("r-portion"); sel.innerHTML = "";
  PROFIL.ordre.forEach(function(n){
    var o = document.createElement("option"); o.value = n;
    var d = PROFIL.lect[n] || 0, ch = INFO.chapitres[n-1];
    o.textContent = (d >= ch ? "✓ " : (d ? "◐ " + d + "/" + ch + " · " : "")) + INFO.plan[n-1];
    sel.appendChild(o);
  });
  if (PROFIL.prochaineN) sel.value = PROFIL.prochaineN;
  majChapitres();
  ["r-verset","r-appris","r-appli","r-question"].forEach(function(id){ $(id).value=""; });
  erreur("r-err",""); ecran("rapport");
}

function majChapitres(){
  var n = Number($("r-portion").value), ch = INFO.chapitres[n-1], deja = PROFIL.lect[n] || 0;
  var reste = deja >= ch ? ch : ch - deja;
  var sel = $("r-chap"); sel.innerHTML = "";
  var o = document.createElement("option"); o.value = reste;
  o.textContent = deja >= ch ? "Toute la portion (" + ch + " chapitres)" : (deja ? "Tout le reste de la portion (" + reste + " chapitres)" : "Toute la portion (" + ch + " chapitres)");
  sel.appendChild(o);
  for (var k = 1; k < reste; k++) { var x = document.createElement("option"); x.value = k; x.textContent = k + " chapitre" + (k > 1 ? "s" : ""); sel.appendChild(x); }
  $("r-deja").textContent = deja >= ch ? "Portion déjà terminée : ce rapport sera enregistré en plus." : (deja ? "Déjà lu dans cette portion : " + deja + " / " + ch + " chapitres." : "");
}

function envoyerRapport(){
  erreur("r-err","");
  var d = { portion:$("r-portion").value, chapitres:$("r-chap").value, verset:$("r-verset").value, appris:$("r-appris").value,
            appli:$("r-appli").value, question:$("r-question").value };
  if (!d.verset.trim() || !d.appris.trim() || !d.appli.trim()) return erreur("r-err","Merci de remplir les trois premières cases.");
  $("r-btn").disabled = true; $("r-btn").textContent = "Envoi…";
  appel("api_rapport", [JETON, d], function(r){
    $("r-btn").disabled = false; $("r-btn").textContent = "Envoyer mon rapport";
    if (r.deconnecte) { ecrireJeton(null); return ecran("connexion"); }
    if (r.erreur) return erreur("r-err", r.erreur);
    PROFIL = r.profil; afficherEspace("✅ Rapport enregistré ! Que Dieu bénisse votre lecture 🙏");
  }, function(m){ $("r-btn").disabled=false; $("r-btn").textContent="Envoyer mon rapport"; erreur("r-err", m + " Votre texte est conservé."); });
}

function voirHisto(){
  ecran("histo"); $("h-liste").textContent = "Chargement…";
  appel("api_mesRapports", [JETON], function(r){
    if (!r.ok) { $("h-liste").textContent = "Impossible d'afficher vos rapports."; return; }
    if (!r.liste.length) { $("h-liste").textContent = "Aucun rapport pour l'instant."; return; }
    $("h-liste").innerHTML = r.liste.map(function(x){
      return "<div><b>" + texte(x.portion) + "</b><br><small>" + texte(x.date) + " · " + texte(x.chapitres) + " chapitre(s)</small><br>" + texte(x.verset) + "</div>";
    }).join("");
  }, function(m){ $("h-liste").textContent = m; });
}

demarrer();
</script>
</body></html>
`;
}
