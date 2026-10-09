import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);

// Application installable : le service worker permet l'ouverture rapide et l'installation sur le téléphone
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
