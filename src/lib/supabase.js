import { createClient } from '@supabase/supabase-js';

// One shared browser client. The publishable key is safe here — every table is
// protected by Row-Level Security, so a signed-in user can only ever read or
// write rows where user_id matches their own auth id.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase config. Copy the project URL + publishable key into .env.local ' +
      '(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), then restart `npm run dev`.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true, // keep the session in localStorage across reloads
    autoRefreshToken: true,
    detectSessionInUrl: true, // pick up the session when a magic link redirects back
  },
});
