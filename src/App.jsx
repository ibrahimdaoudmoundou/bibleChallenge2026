import { lazy, Suspense } from 'react';
import Participant from './participant/Participant.jsx';
import { configured } from './supabase.js';
import { Loading } from './ui/kit.jsx';

// L'administration est chargée à part : les participants ne téléchargent pas son code
const Admin = lazy(() => import('./admin/Admin.jsx'));

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
  if (seg === 'admin') return <Suspense fallback={<div className="solo"><Loading /></div>}><Admin /></Suspense>;
  return <Participant slug={seg.toLowerCase()} />;
}
