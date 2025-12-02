import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL o anon key no definidas. Revisa frontend/.env.local');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
const HEARTBEAT_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 horas sin actividad
const HEARTBEAT_TICK_MS = 15 * 60 * 1000; // Comprobación cada 15 minutos

let lastSupabaseActivity = Date.now();
let heartbeatTimerId = null;

export function markSupabaseActivity() {
  lastSupabaseActivity = Date.now();
}

function startSupabaseHeartbeat() {
  if (typeof window === 'undefined') return;
  if (heartbeatTimerId !== null) return;

  heartbeatTimerId = window.setInterval(async () => {
    const idleTime = Date.now() - lastSupabaseActivity;
    if (idleTime < HEARTBEAT_INTERVAL_MS) {
      return;
    }

    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        throw error;
      }
    } catch (err) {
      console.warn('No se pudo ejecutar el heartbeat de Supabase', err);
    } finally {
      markSupabaseActivity();
    }
  }, HEARTBEAT_TICK_MS);
}

supabase.auth.onAuthStateChange(() => {
  markSupabaseActivity();
});

startSupabaseHeartbeat();
