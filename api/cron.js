// Robot d'e-mails : appelé automatiquement par Supabase (pg_cron) aux heures prévues.
//   /api/cron?task=morning   → annonce du matin
//   /api/cron?task=evening   → bilan du soir
//   /api/cron?task=reminders → liste des personnes à relancer
//   /api/cron?task=ping      → simple appel pour garder la base éveillée
// Options de test : &force=1 (ignore les dates) et &to=adresse@mail.com (envoie seulement à cette adresse)
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import {
  morningText, eveningText, reminderText, needsReminder, waLink, waShare, STATUT_LABELS,
} from "../shared/messages.js";

// Rapport PDF joint : chargé à la demande ; en cas de souci, l'e-mail part quand même (sans pièce jointe).
async function reportAttachment(s, moment) {
  try {
    const { buildReportPdf } = await import("../shared/reportPdf.js");
    return [buildReportPdf(s, moment)];
  } catch (e) {
    console.error("PDF du rapport impossible :", e);
    return [];
  }
}

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/\n/g, "<br>");

const recipients = (c, to) =>
  to ? [to] : String(c.admin_emails || "").split(/[,;\s]+/).filter((x) => x.includes("@"));

function whatsappMail(text, c) {
  return (
    `<div style='font-family:Arial,sans-serif;font-size:15px'>` +
    `<p><a href='${waShare(text)}' style='display:inline-block;background:#25D366;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold'>📲 Ouvrir dans WhatsApp</a></p>` +
    `<p style='color:#555'>Touchez le bouton depuis votre téléphone, choisissez le grand groupe, puis appuyez sur Envoyer.</p>` +
    `<pre style='white-space:pre-wrap;background:#f4f4f4;padding:12px;border-radius:8px;font-family:Arial,sans-serif'>${esc(text)}</pre>` +
    `<p style='color:#888;font-size:12px'>${esc(c.signature)}</p></div>`
  );
}

function remindersMails(s, c) {
  const list = (s.participants || []).filter(needsReminder).sort((a, b) => (b.retard || 0) - (a.retard || 0));
  const PAR_MAIL = 100;
  const parties = Math.max(1, Math.ceil(list.length / PAR_MAIL));
  const mails = [];
  for (let k = 0; k < parties; k++) {
    const lot = list.slice(k * PAR_MAIL, (k + 1) * PAR_MAIL);
    let html =
      `<div style='font-family:Arial,sans-serif;font-size:15px'><h2 style='color:#1f3864'>🔔 Personnes à relancer — jour ${s.jour}` +
      (parties > 1 ? ` (partie ${k + 1}/${parties})` : "") + `</h2>` +
      `<p>${list.length} personne(s) au total. Touchez un nom depuis votre téléphone : WhatsApp s'ouvre avec un rappel déjà écrit. ` +
      `Vous pouvez répartir les parties entre les administrateurs.</p><ol start='${k * PAR_MAIL + 1}'>`;
    for (const p of lot) {
      html += `<li style='margin:6px 0'><a href='${waLink(p.phone, reminderText(p, s))}'>${esc(p.name)}</a> — ${esc(STATUT_LABELS[p.statut])} (${p.retard} chapitres de retard)</li>`;
    }
    if (!lot.length) html += `<p>Personne à relancer. Bravo à tous ! 🎉</p>`;
    html += `</ol></div>`;
    mails.push({
      subject: `🔔 Jour ${s.jour} — ${list.length} personne(s) à relancer` + (parties > 1 ? ` (${k + 1}/${parties})` : ""),
      html,
    });
  }
  return mails;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers["x-cron-secret"] || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!secret || given !== secret) return res.status(401).json({ error: "Non autorisé" });

  const { task = "ping", force, to } = req.query || {};
  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
    const { data: summaries, error } = await sb.rpc("cron_summaries");
    if (error) throw error;
    if (task === "ping") return res.status(200).json({ ok: true, sessions: summaries.length });

    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    const from = `Challenge Bible <${process.env.GMAIL_USER}>`;
    const sent = [];

    for (const s of summaries) {
      const c = s.challenge, jour = s.jour, total = c.total_days;
      const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
      if (!c.platform_url) c.platform_url = `${origin}/${c.slug}`;
      // Les e-mails des administrateurs portent le rapport de lecture du jour (PDF joint), plus le lien du plan.
      c.plan_url = "";
      const dest = recipients(c, to);
      if (!dest.length) continue;
      let mails = [];
      if (task === "morning") {
        if (!force && (jour < -6 || jour > total)) continue;
        mails = [{ subject: `☀️ ${c.name} — Jour ${jour} : annonce du matin à publier`, html: whatsappMail(morningText(s), c),
          attachments: jour >= 1 ? await reportAttachment(s, "morning") : [] }];
      } else if (task === "evening") {
        if (!force && (jour < 1 || jour > total)) continue;
        mails = [{ subject: `🌙 ${c.name} — Jour ${jour} : bilan du soir à publier`, html: whatsappMail(eveningText(s), c),
          attachments: await reportAttachment(s, "evening") }];
      } else if (task === "reminders") {
        if (!force && (jour < 2 || jour > total + 3)) continue;
        mails = remindersMails(s, c).map((m) => ({ ...m, subject: `${c.name} — ${m.subject}` }));
      } else {
        return res.status(400).json({ error: "Tâche inconnue" });
      }
      for (const m of mails) {
        await transport.sendMail({ from, to: dest.join(", "), subject: m.subject, html: (m.attachments || []).length
          ? m.html.replace(/<\/div>$/, "<p style='color:#2a3f8f'>📎 En pièce jointe : le rapport de lecture du jour (tous les participants et leur avancement).</p></div>")
          : m.html,
          attachments: m.attachments || [] });
        sent.push({ session: c.slug, subject: m.subject, to: dest.length });
      }
    }
    return res.status(200).json({ ok: true, task, sent });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
