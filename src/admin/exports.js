// Exports PDF / Excel / CSV de l'administration.
// Les bibliothèques sont chargées seulement au moment de l'export : la page des participants reste légère.

const CREDIT = 'Produit par IbtecH — www.ibtech.click';

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const cellText = (v) => (v === null || v === undefined ? '' : String(v));

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// columns : [{ header, get: (row) => valeur, width? (caractères), pdfWidth? }]
export async function exportTable({ format, title, subtitle = '', columns, rows, filename }) {
  const base = `${filename}-${stamp()}`;
  if (format === 'csv') {
    const lines = [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => c.get(r)))];
    const csv = lines.map((l) => l.map((v) => `"${cellText(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `${base}.csv`);
    return;
  }
  if (format === 'xlsx') {
    const { default: writeExcelFile } = await import('write-excel-file/browser');
    const data = [
      columns.map((c) => ({ value: c.header, fontWeight: 'bold', backgroundColor: '#E6EAF8' })),
      ...rows.map((r) => columns.map((c) => {
        const v = c.get(r);
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'number') return { value: v, type: Number };
        return { value: String(v), type: String, wrap: String(v).length > 60 };
      })),
    ];
    const blob = await writeExcelFile(data, {
      columns: columns.map((c) => ({ width: c.width || 16 })),
      sheet: title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '),
      stickyRowsCount: 1,
    }).toBlob();
    download(blob, `${base}.xlsx`);
    return;
  }
  // PDF
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const wide = columns.length > 6;
  const doc = new jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(23, 33, 63);
  doc.text(title, 40, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(91, 101, 133);
  const sub = doc.splitTextToSize(`${subtitle}${subtitle ? ' · ' : ''}Exporté le ${new Date().toLocaleString('fr-FR')}`, W - 80);
  doc.text(sub, 40, 64);
  autoTable(doc, {
    startY: 64 + sub.length * 12 + 8,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => cellText(c.get(r)))),
    styles: { fontSize: 8.5, cellPadding: 4, overflow: 'linebreak', textColor: [28, 35, 64] },
    headStyles: { fillColor: [42, 63, 143], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [243, 245, 251] },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, c.pdfWidth ? { cellWidth: c.pdfWidth } : {}])),
    margin: { left: 40, right: 40, bottom: 40 },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(140, 148, 170);
      doc.text(CREDIT, 40, H - 20);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, W - 40, H - 20, { align: 'right' });
    },
  });
  doc.save(`${base}.pdf`);
}

// Fiche de suivi complète d'un participant (PDF)
export async function exportParticipantPdf({ p, reports, s, statusLabel }) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(23, 33, 63);
  doc.text(p.name, 40, 50);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(91, 101, 133);
  doc.text(`${s.challenge.name} · Fiche de suivi · ${new Date().toLocaleDateString('fr-FR')}`, 40, 68);
  const total = s.total_chapters || 1;
  const info = [
    ['Identifiant', p.code], ['Téléphone', `+${p.phone}`],
    ['Pays', p.country || '—'], ['Ville / localité', p.city || '—'],
    ['Participations précédentes', p.previous_participations ?? '—'],
    ['Statut', statusLabel], ['Chapitres lus', `${p.chap_lus} sur ${total} (${Math.round((100 * p.chap_lus) / total)} %)`],
    ['Retard', `${p.retard} chapitre(s)`], ['Portions terminées', p.completes],
    ['Rapports envoyés', p.nb_rapports ?? reports.length], ['Jours actifs', p.jours_actifs ?? '—'],
    ['Inscrit le', new Date(p.created_at).toLocaleDateString('fr-FR')],
  ];
  if (p.added_by) info.push(['Ajouté par', p.added_by]);
  autoTable(doc, {
    startY: 84, body: info, theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3, textColor: [28, 35, 64] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 170 } }, margin: { left: 40, right: 40 },
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 16,
    head: [['Date', 'Portion', 'Ch.', 'Verset', 'Appris', 'Application']],
    body: reports.map((r) => [
      new Date(r.created_at).toLocaleDateString('fr-FR'), r.label ? `P${r.portion_n} — ${r.label}` : `P${r.portion_n}`,
      r.chapters, r.verse, r.learned, r.application + (r.entered_by ? `\n(saisi par ${r.entered_by})` : ''),
    ]),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak', textColor: [28, 35, 64] },
    headStyles: { fillColor: [42, 63, 143], textColor: 255 },
    columnStyles: { 0: { cellWidth: 54 }, 1: { cellWidth: 80 }, 2: { cellWidth: 24 } },
    margin: { left: 40, right: 40, bottom: 40 },
    didDrawPage: () => {
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(140, 148, 170);
      doc.text(CREDIT, 40, H - 20);
      doc.text(`Page ${doc.internal.getNumberOfPages()}`, W - 40, H - 20, { align: 'right' });
    },
  });
  doc.save(`suivi-${p.code}-${stamp()}.pdf`);
}
