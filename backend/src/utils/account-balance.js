export async function computeAccountBalance(supabaseClient, userId, { source, accountId = null, currency, account = null }) {
  const normalizedCurrency = `${currency ?? ''}`.trim().toUpperCase();
  const filters = (query) =>
    query
      .eq('user_id', userId)
      .eq('source', source)
      .eq('currency', normalizedCurrency)
      .is('deleted_at', null);

  const incomeQuery = filters(supabaseClient.from('incomes').select('amount, currency, account_id'));
  if (source === 'bank') {
    incomeQuery.eq('account_id', accountId);
  } else {
    incomeQuery.is('account_id', null);
  }

  const expenseQuery = supabaseClient
    .from('expenses')
    .select('amount, currency, source, account_id')
    .eq('user_id', userId)
    .eq('currency', normalizedCurrency)
    .eq('source', source)
    .is('deleted_at', null);
  if (source === 'bank') {
    expenseQuery.eq('account_id', accountId);
  } else {
    expenseQuery.is('account_id', null);
  }

  const outgoingTransferQuery = supabaseClient
    .from('transfers')
    .select('amount, currency, from_type, from_account_id')
    .eq('user_id', userId)
    .eq('currency', normalizedCurrency)
    .eq('from_type', source)
    .is('deleted_at', null);
  if (source === 'bank') {
    outgoingTransferQuery.eq('from_account_id', accountId);
  } else {
    outgoingTransferQuery.is('from_account_id', null);
  }

  const incomingTransferQuery = supabaseClient
    .from('transfers')
    .select('amount, currency, to_type, to_account_id')
    .eq('user_id', userId)
    .eq('currency', normalizedCurrency)
    .eq('to_type', source)
    .is('deleted_at', null);
  if (source === 'bank') {
    incomingTransferQuery.eq('to_account_id', accountId);
  } else {
    incomingTransferQuery.is('to_account_id', null);
  }

  const [{ data: incomes = [], error: incomesError }, { data: expenses = [], error: expensesError }, { data: outgoing = [], error: outgoingError }, { data: incoming = [], error: incomingError }] = await Promise.all([
    incomeQuery,
    expenseQuery,
    outgoingTransferQuery,
    incomingTransferQuery
  ]);

  if (incomesError || expensesError || outgoingError || incomingError) {
    const error = incomesError ?? expensesError ?? outgoingError ?? incomingError;
    throw error;
  }

  const totalIncomes = incomes.reduce((acc, row) => acc + Number(row.amount ?? 0), 0);
  const totalExpenses = expenses.reduce((acc, row) => acc + Number(row.amount ?? 0), 0);
  const totalOutgoing = outgoing.reduce((acc, row) => acc + Number(row.amount ?? 0), 0);
  const totalIncoming = incoming.reduce((acc, row) => acc + Number(row.amount ?? 0), 0);

  const initialBalance = source === 'bank' ? Number(account?.initial_balance ?? 0) : 0;

  return initialBalance + totalIncomes + totalIncoming - totalExpenses - totalOutgoing;
}
