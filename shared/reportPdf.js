// Rapport de lecture du jour (PDF joint aux e-mails automatiques des administrateurs).
// Liste de tous les participants avec leur niveau d'avancement. Généré côté serveur (Vercel).
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

const STATUTS = {
  termine: "Terminé",
  pas_commence: "Pas commencé",
  aucun: "Aucun rapport",
  a_jour: "À jour",
  leger: "Léger retard",
  retard: "En retard",
};

// Les polices PDF standard ne connaissent que l'alphabet latin : on retire émojis et caractères exotiques.
const KEEP = new Set("’‘“”–—…€•œŒ".split(""));
const clean = (v) =>
  String(v ?? "")
    .split("")
    .filter((ch) => ch.charCodeAt(0) <= 255 || KEEP.has(ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();

const fmtDate = (iso, tz) =>
  iso ? new Intl.DateTimeFormat("fr-FR", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(new Date(iso)) : "—";

// s = résumé de session renvoyé par cron_summaries ; moment = "morning" | "evening"
export function buildReportPdf(s, moment = "evening") {
  const c = s.challenge;
  const tz = c.timezone || "Africa/Douala";
  const total = s.total_chapters || 1;
  const ps = (s.participants || []).slice();
  const n = ps.length;
  const pct = (p) => Math.round((100 * (p.chap_lus || 0)) / total);
  ps.sort((a, b) => (b.chap_lus || 0) - (a.chap_lus || 0) || String(a.name).localeCompare(String(b.name), "fr"));

  const count = (f) => ps.filter(f).length;
  const ajour = count((p) => p.statut === "a_jour" || p.statut === "termine");
  const leger = count((p) => p.statut === "leger");
  const retard = count((p) => p.statut === "retard");
  const aucun = count((p) => p.statut === "aucun");
  const auj = count((p) => p.rapport_aujourdhui);
  const lus = ps.reduce((a, p) => a + (p.chap_lus || 0), 0);
  const moy = n ? Math.round((100 * lus) / (n * total)) : 0;

  const now = new Date();
  const dateTxt = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(now);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(23, 33, 63);
  doc.text(clean(`${c.name} — Rapport de lecture du jour ${s.jour}/${c.total_days}`), 40, 46);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(91, 101, 133);
  doc.text(clean(`Situation au ${dateTxt} à ${heure}${moment === "morning" ? " (bilan des journées terminées)" : ""}`), 40, 64);

  // Chiffres clés
  const tiles = [
    ["Participants", String(n)],
    ["Rapports aujourd'hui", `${auj}`],
    ["À jour", `${ajour} (${n ? Math.round((100 * ajour) / n) : 0} %)`],
    ["Léger retard", String(leger)],
    ["En retard", String(retard)],
    ["Aucun rapport", String(aucun)],
    ["Moyenne lue", `${moy} %`],
  ];
  const tw = (W - 80 - 6 * 8) / 7;
  tiles.forEach(([k, v], i) => {
    const x = 40 + i * (tw + 8);
    doc.setFillColor(243, 245, 251); doc.roundedRect(x, 78, tw, 44, 6, 6, "F");
    doc.setFontSize(8.5); doc.setTextColor(91, 101, 133); doc.text(clean(k), x + 8, 93);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(23, 33, 63); doc.text(clean(v), x + 8, 112);
    doc.setFont("helvetica", "normal");
  });

  const colors = { a_jour: [45, 138, 103], termine: [45, 138, 103], leger: [176, 120, 0], retard: [192, 57, 43], aucun: [120, 128, 150] };

  autoTable(doc, {
    startY: 136,
    head: [["#", "Code", "Nom", "Ville, pays", "Statut", "Chapitres lus", "%", "Retard (ch.)", "Rapport aujourd'hui", "Dernier rapport"]],
    body: ps.map((p, i) => [
      String(i + 1),
      clean(p.code),
      clean(p.name),
      clean([p.city, p.country].filter(Boolean).join(", ")) || "—",
      STATUTS[p.statut] || clean(p.statut),
      `${p.chap_lus || 0} / ${total}`,
      `${pct(p)} %`,
      String(p.retard || 0),
      p.rapport_aujourdhui ? "Oui" : "Non",
      fmtDate(p.dernier_rapport, tz),
    ]),
    styles: { fontSize: 8.5, cellPadding: 4, overflow: "linebreak", textColor: [28, 35, 64] },
    headStyles: { fillColor: [42, 63, 143], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [243, 245, 251] },
    columnStyles: {
      0: { cellWidth: 26, halign: "right" }, 1: { cellWidth: 46 }, 2: { cellWidth: 150 },
      5: { halign: "right" }, 6: { halign: "right", cellWidth: 38 }, 7: { halign: "right" }, 8: { halign: "center" },
    },
    margin: { left: 40, right: 40, bottom: 36 },
    didParseCell: (d) => {
      if (d.section === "body" && d.column.index === 4) {
        const st = ps[d.row.index]?.statut;
        if (colors[st]) { d.cell.styles.textColor = colors[st]; d.cell.styles.fontStyle = "bold"; }
      }
    },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(140, 148, 170);
      doc.text("Challenge Bible — envoi automatique · Produit par IbtecH", 40, H - 18);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, W - 40, H - 18, { align: "right" });
    },
  });

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  return {
    filename: `rapport-lecture-jour-${s.jour}-${stamp}.pdf`,
    content: Buffer.from(doc.output("arraybuffer")),
  };
}
