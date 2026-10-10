import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Valeurs PUBLIQUES de secours (elles finissent de toute façon dans le JS du navigateur).
// Elles servent si VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ne sont pas définies dans Vercel.
// Ne JAMAIS mettre ici la clé service_role / sb_secret.
const PUBLIC_SUPABASE_URL = 'https://kzxbmtbqqetyrumpybpl.supabase.co';
const PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_CstVxhHHttDKuR6p-aKQHw_ziCAzqUk';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || PUBLIC_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON_KEY;
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
    },
  };
});
