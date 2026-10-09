import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';
import { Sheet } from './kit.jsx';

// Le navigateur envoie « beforeinstallprompt » une seule fois, parfois très tôt : on le garde ici.
let deferred = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
}

export function usePwaInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  const standalone = Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const ua = navigator.userAgent || '';
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const install = async () => {
    if (!deferred) return 'manual';
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    tick((x) => x + 1);
    return outcome;
  };
  return { standalone, ios, canPrompt: Boolean(deferred), install };
}

const KEY = 'cb_install_hidden';
const hiddenRecently = () => {
  try { const t = Number(localStorage.getItem(KEY) || 0); return Date.now() - t < 7 * 864e5; } catch { return false; }
};

function HowTo({ open, onClose, ios }) {
  return (
    <Sheet open={open} onClose={onClose} title="Installer l'application">
      {ios ? (
        <ol className="howto">
          <li>Ouvrez cette page dans <b>Safari</b>.</li>
          <li>Touchez le bouton <b>Partager</b> (un carré avec une flèche vers le haut), en bas de l'écran.</li>
          <li>Faites défiler et touchez <b>Sur l'écran d'accueil</b>.</li>
          <li>Touchez <b>Ajouter</b>. L'icône du challenge apparaît avec vos autres applications.</li>
        </ol>
      ) : (
        <ol className="howto">
          <li>Touchez le menu <b>⋮</b> de votre navigateur (en haut à droite).</li>
          <li>Choisissez <b>Installer l'application</b> ou <b>Ajouter à l'écran d'accueil</b>.</li>
          <li>Confirmez. L'icône du challenge apparaît avec vos autres applications.</li>
        </ol>
      )}
      <p className="muted small">Rien à télécharger depuis une boutique : l'application s'ouvre en plein écran, comme les autres.</p>
    </Sheet>
  );
}

// Carte d'invitation à installer (accueil et page « Aujourd'hui »)
export function InstallCard({ dismissible = true }) {
  const { standalone, ios, canPrompt, install } = usePwaInstall();
  const [how, setHow] = useState(false);
  const [hidden, setHidden] = useState(hiddenRecently());
  if (standalone || hidden) return null;
  const go = async () => { if (!canPrompt) setHow(true); else { const r = await install(); if (r === 'manual') setHow(true); } };
  const close = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignoré */ } setHidden(true); };
  return (
    <>
      <div className="install">
        <img src="/icons/icon-192.png" alt="" width="44" height="44" />
        <div className="install-text"><b>Installer l'application</b><span>Ouvrez le challenge en un geste, comme une vraie application.</span></div>
        <button className="install-btn" onClick={go}>Installer</button>
        {dismissible ? <button className="icon-btn" onClick={close} aria-label="Masquer"><Icon name="close" size={18} /></button> : null}
      </div>
      <HowTo open={how} onClose={() => setHow(false)} ios={ios} />
    </>
  );
}

// Bouton dans le menu du compte
export function InstallButton() {
  const { standalone, ios, canPrompt, install } = usePwaInstall();
  const [how, setHow] = useState(false);
  if (standalone) return null;
  const go = async () => { if (!canPrompt) setHow(true); else { const r = await install(); if (r === 'manual') setHow(true); } };
  return (
    <>
      <button className="btn quiet" onClick={go}><Icon name="download" /> Installer l'application</button>
      <HowTo open={how} onClose={() => setHow(false)} ios={ios} />
    </>
  );
}
