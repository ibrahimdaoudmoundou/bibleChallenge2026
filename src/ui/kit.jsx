import { useEffect } from 'react';
import { Icon } from './icons.jsx';

export const STATUS = {
  termine: { label: 'Terminé', tone: 'ok' },
  a_jour: { label: 'À jour', tone: 'ok' },
  leger: { label: 'Léger retard', tone: 'warn' },
  retard: { label: 'En retard', tone: 'bad' },
  aucun: { label: 'Aucun rapport', tone: 'mute' },
  pas_commence: { label: 'Pas encore commencé', tone: 'mute' },
};

export const Chip = ({ status }) => {
  const s = STATUS[status] || STATUS.pas_commence;
  return <span className={`chip ${s.tone}`}><i />{s.label}</span>;
};

export function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <Icon name="check" size={18} strokeWidth={2.4} /> <span>{message}</span>
    </div>
  );
}

// Fenêtre qui monte du bas sur téléphone, centrée sur ordinateur
export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Field = ({ label, hint, children }) => (
  <label className="field">
    <span className="field-label">{label}</span>
    {children}
    {hint ? <span className="field-hint">{hint}</span> : null}
  </label>
);

export const Loading = ({ text = 'Chargement…' }) => (
  <div className="loading" role="status"><span className="spinner" />{text}</div>
);

const MOIS = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const MOIS_COURT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
export const parseISO = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return d; };
export const longDate = (d) => MOIS.format(d);
export const shortDate = (d) => MOIS_COURT.format(d);
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
