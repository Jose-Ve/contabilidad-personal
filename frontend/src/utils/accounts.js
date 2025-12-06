export const ACCOUNT_INSTITUTIONS = [
  { value: 'BAC', label: 'BAC' },
  { value: 'Lafise', label: 'Lafise' },
  { value: 'Banpro', label: 'Banpro' },
  { value: 'Otro', label: 'Otro banco' }
];

export function getInstitutionLabel(institution) {
  const match = ACCOUNT_INSTITUTIONS.find((option) => option.value === institution);
  return match ? match.label : institution;
}

export function formatAccountName(account) {
  if (!account) return '';
  const bankLabel = getInstitutionLabel(account.bank_institution ?? '');
  if (account.name && account.bank_institution && account.bank_institution !== 'Otro') {
    const normalizedName = `${account.name}`.trim().toLowerCase();
    const normalizedLabel = `${bankLabel}`.trim().toLowerCase();
    if (normalizedName === normalizedLabel) {
      return bankLabel;
    }
    return `${account.name} (${bankLabel})`;
  }
  if (account.name) return account.name;
  if (account.bank_institution === 'Otro' && account.institution_name) {
    return account.institution_name;
  }
  return bankLabel;
}

export function buildAccountOption(account) {
  return {
    value: account.id,
    label: formatAccountName(account)
  };
}
