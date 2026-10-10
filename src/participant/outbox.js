// Rapports en attente d'envoi (hors connexion) : gardés sur le téléphone, envoyés dès le retour d'Internet.
import { rpc, safeGet, safeSet, isMissingFn, isOffline } from '../supabase.js';

const key = (slug) => `cb_outbox_${slug}`;
const draftKey = (slug) => `cb_draft_${slug}`;

export const uuid = () => {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* ancien navigateur */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

export function readOutbox(slug) {
  try { return JSON.parse(safeGet(key(slug)) || '[]'); } catch { return []; }
}
const writeOutbox = (slug, list) => safeSet(key(slug), list.length ? JSON.stringify(list) : null);

export function enqueue(slug, token, payload) {
  const list = readOutbox(slug);
  list.push({ id: payload.p_client_id || uuid(), token, payload, at: new Date().toISOString() });
  writeOutbox(slug, list);
  return list.length;
}

// Brouillon du formulaire de rapport (rien n'est perdu si la page se ferme)
export const readDraft = (slug) => { try { return JSON.parse(safeGet(draftKey(slug)) || 'null'); } catch { return null; } };
export const saveDraft = (slug, d) => safeSet(draftKey(slug), d ? JSON.stringify(d) : null);

// Envoi d'un rapport : nouvelle fonction (sans doublon), sinon l'ancienne si la base n'est pas encore à jour
export async function sendReport(payload) {
  try {
    return await rpc('api_report_v2', payload);
  } catch (e) {
    if (!isMissingFn(e)) throw e;
    const { p_client_id: _ignored, ...old } = payload;
    return rpc('api_report', old);
  }
}

let running = null;
// Renvoie { sent, profile, failed: [messages], needLogin }. Un seul envoi à la fois.
export function flushOutbox(slug) {
  if (isOffline()) return Promise.resolve({ sent: 0 });
  if (!running) running = doFlush(slug).finally(() => { running = null; });
  return running;
}

async function doFlush(slug) {
  const res = { sent: 0, profile: null, failed: [], needLogin: false };
  try {
    let list = readOutbox(slug);
    for (const item of [...list]) {
      let r;
      try { r = await sendReport({ ...item.payload, p_token: item.token, p_client_id: item.id }); } catch { break; } // toujours pas de réseau
      if (r.logged_out) { res.needLogin = true; continue; }
      list = list.filter((x) => x.id !== item.id);
      writeOutbox(slug, list);
      if (r.error) res.failed.push(r.error);
      else { res.sent += 1; res.profile = r.profile; }
    }
  } catch { /* réessai plus tard */ }
  return res;
}
