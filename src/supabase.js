import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;

// Appel d'une fonction de la base, avec nouvelles tentatives en cas de réseau instable
export async function rpc(fn, args = {}) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        if (error.code) throw Object.assign(new Error(error.message), { fatal: true, code: error.code });
        throw new Error(error.message || 'réseau');
      }
      return data;
    } catch (e) {
      last = e;
      if (e.fatal) break;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1) + Math.random() * 1000));
    }
  }
  throw last;
}

// Fonction absente de la base (mise à jour SQL pas encore faite) : on revient à l'ancienne fonction
export const isMissingFn = (e) => Boolean(e && (e.code === 'PGRST202' || e.code === '42883'));

// Hors connexion : on n'attend pas les nouvelles tentatives
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const safeSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* ignoré */ } };

export const formatDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
