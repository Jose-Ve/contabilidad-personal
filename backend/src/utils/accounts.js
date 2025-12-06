export const ACCOUNT_INSTITUTIONS = ['BAC', 'Lafise', 'Banpro', 'Otro'];

export function normalizeInstitution(value) {
  if (!value) return null;
  const normalized = `${value}`.trim();
  return ACCOUNT_INSTITUTIONS.includes(normalized) ? normalized : null;
}

export function normalizeCurrency(value) {
  if (!value) return null;
  const normalized = `${value}`.trim().toUpperCase();
  return normalized === 'NIO' || normalized === 'USD' ? normalized : null;
}

export function sanitizeAccountName(value) {
  if (!value) return null;
  const normalized = `${value}`.trim();
  return normalized.length > 0 ? normalized : null;
}

export function sanitizeOptionalText(value) {
  if (!value) return null;
  const normalized = `${value}`.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function loadUserAccount(supabaseClient, userId, accountId) {
  if (!accountId) {
    return null;
  }
  const { data, error } = await supabaseClient
    .from('accounts')
    .select('id, user_id, name, bank_institution, institution_name, currency, initial_balance, deleted_at')
    .eq('id', accountId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

export function ensureAccountCurrency(account, currency) {
  if (!account) {
    return true;
  }
  const normalizedCurrency = normalizeCurrency(currency);
  return normalizedCurrency === account.currency;
}
