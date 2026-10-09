import Participant from './participant/Participant.jsx';
import Admin from './admin/Admin.jsx';
import { configured } from './supabase.js';

export default function App() {
  if (!configured) {
    return (
      <main className="page">
        <div className="carte">
          <h2>Configuration manquante</h2>
          <p>Les variables <b>VITE_SUPABASE_URL</b> et <b>VITE_SUPABASE_ANON_KEY</b> ne sont pas définies.
            Ajoutez-les dans Vercel (Settings &gt; Environment Variables), puis redéployez.</p>
        </div>
      </main>
    );
  }
  const seg = window.location.pathname.split('/').filter(Boolean)[0] || '';
  if (seg === 'admin') return <Admin />;
  return <Participant slug={seg.toLowerCase()} />;
}
