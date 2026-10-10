import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);

// Application installable : le service worker permet l'ouverture rapide et l'installation sur le téléphone
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    // Garde aussi les fichiers de l'application déjà chargés : elle s'ouvre même sans connexion
    navigator.serviceWorker.ready.then(() => {
      if (!('caches' in window)) return;
      const files = [...document.querySelectorAll('script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href]')]
        .map((el) => el.src || el.href)
        .filter((u) => u && new URL(u).origin === window.location.origin);
      caches.open('cb-v1').then((c) => c.addAll(files)).catch(() => {});
    }).catch(() => {});
  });
}
