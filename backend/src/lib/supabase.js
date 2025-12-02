import { createClient } from '@supabase/supabase-js';
import { config } from '../env.js';

export const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const EXTENDED_PROFILE_COLUMNS = 'id, email, full_name, first_name, last_name, gender, role, deleted_at';
const BASIC_PROFILE_COLUMNS = 'id, email, full_name, role, deleted_at';

export async function getProfileById(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(EXTENDED_PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error?.code === '42703') {
    const fallback = await supabaseAdmin
      .from('profiles')
      .select(BASIC_PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();
    if (fallback.error) {
      throw fallback.error;
    }
    return fallback.data ?? null;
  }

  if (error?.code === 'PGRST116') {
    return null;
  }

  if (error) {
    throw error;
  }

  return data ?? null;
}

export async function ensureProfileExists({ id, email }) {
  const existing = await getProfileById(id);
  if (existing) {
    return existing;
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert({ id, email, role: 'user', full_name: null, first_name: null, last_name: null, gender: null })
    .select(EXTENDED_PROFILE_COLUMNS)
    .single();

  if (error?.code === '42703') {
    const fallback = await supabaseAdmin
      .from('profiles')
      .insert({ id, email, role: 'user', full_name: null })
      .select(BASIC_PROFILE_COLUMNS)
      .single();
    if (fallback.error) {
      throw fallback.error;
    }
    return fallback.data;
  }

  if (error) {
    throw error;
  }

  return data;
}
