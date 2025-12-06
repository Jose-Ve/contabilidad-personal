import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { parseWithSchema } from '../utils/validation.js';

const USD_TO_NIO_RATE = 36.7;

const toNio = (amount, currency) => {
  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(numericAmount)) {
    return 0;
  }

  const normalizedCurrency = `${currency ?? ''}`.trim().toUpperCase();
  if (normalizedCurrency === 'NIO' || normalizedCurrency === '') {
    return numericAmount;
  }

  return numericAmount * USD_TO_NIO_RATE;
};

const toUsd = (amount, currency) => {
  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(numericAmount)) {
    return 0;
  }

  const normalizedCurrency = `${currency ?? ''}`.trim().toUpperCase();
  if (normalizedCurrency === 'USD') {
    return numericAmount;
  }

  return numericAmount / USD_TO_NIO_RATE;
};

const balanceQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  range: z.enum(['current-month', 'current-year']).optional()
});

function aggregateByMonth(incomes, expenses) {
  const map = new Map();

  const accumulate = (collection, key) => {
    for (const item of collection) {
      const month = item.date.slice(0, 7);
      if (!map.has(month)) {
        map.set(month, {
          month,
          incomes: 0,
          expenses: 0,
          incomesBank: 0,
          incomesCash: 0,
          expensesBank: 0,
          expensesCash: 0
        });
      }
      const bucket = map.get(month);
      const amount = toNio(item.amount, item.currency);
      const sourceKey = item.source === 'bank' ? 'Bank' : 'Cash';

      bucket[key] += amount;
      const detailKey = `${key}${sourceKey}`;
      if (detailKey in bucket) {
        bucket[detailKey] += amount;
      }
    }
  };

  accumulate(incomes, 'incomes');
  accumulate(expenses, 'expenses');

  return Array.from(map.values()).sort((a, b) => (a.month < b.month ? -1 : 1));
}

function normalizeRange(filters) {
  if (filters.range === 'current-month') {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { from, to };
  }
  if (filters.range === 'current-year') {
    const now = new Date();
    const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10);
    return { from, to };
  }
  return { from: filters.from, to: filters.to };
}

export default async function balanceRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const filters = parseWithSchema(balanceQuerySchema, request.query ?? {});
    const { from, to } = normalizeRange(filters);

    let incomesQuery = supabaseAdmin
      .from('incomes')
      .select('amount, currency, date, source, account_id, account:accounts!left(id,name,currency,bank_institution,institution_name)')
      .eq('user_id', request.user.id)
      .is('deleted_at', null);

    let expensesQuery = supabaseAdmin
      .from('expenses')
      .select('amount, currency, date, source, account_id, account:accounts!left(id,name,currency,bank_institution,institution_name)')
      .eq('user_id', request.user.id)
      .is('deleted_at', null);

    if (from) {
      incomesQuery = incomesQuery.gte('date', from);
      expensesQuery = expensesQuery.gte('date', from);
    }
    if (to) {
      incomesQuery = incomesQuery.lte('date', to);
      expensesQuery = expensesQuery.lte('date', to);
    }

    const transfersQuery = supabaseAdmin
      .from('transfers')
      .select('amount, currency, date, from_type, from_account_id, to_type, to_account_id')
      .eq('user_id', request.user.id)
      .is('deleted_at', null);

    let accountsQuery = supabaseAdmin
      .from('accounts')
      .select('id, name, currency, bank_institution, institution_name, initial_balance')
      .eq('user_id', request.user.id)
      .is('deleted_at', null);

    if (from) {
      transfersQuery.gte('date', from);
    }
    if (to) {
      transfersQuery.lte('date', to);
    }

    const [incomesResult, expensesResult, transfersResult, accountsResult] = await Promise.all([
      incomesQuery,
      expensesQuery,
      transfersQuery,
      accountsQuery
    ]);

    if (incomesResult.error || expensesResult.error || transfersResult.error || accountsResult.error) {
      request.log.error(
        {
          incomesError: incomesResult.error,
          expensesError: expensesResult.error,
          transfersError: transfersResult.error,
          accountsError: accountsResult.error
        },
        'Error al calcular balance'
      );
      return reply.code(500).send({ message: 'No se pudo calcular el balance' });
    }

    const incomes = incomesResult.data ?? [];
    const expenses = expensesResult.data ?? [];
    const transfers = transfersResult.data ?? [];
    const accounts = accountsResult.data ?? [];

    const sumsBySource = (collection) =>
      collection.reduce(
        (acc, row) => {
          const amount = toNio(row.amount, row.currency);
          const key = row.source === 'bank' ? 'bank' : 'cash';
          acc.total += amount;
          acc[key] += amount;
          return acc;
        },
        { total: 0, bank: 0, cash: 0 }
      );

    const summarizeAccounts = (incomeRows, expenseRows, transferRows, accountRows) => {
      const map = new Map();

      const resolveAccountInfo = (row) => {
        if (row.account) {
          return {
            id: row.account.id,
            name: row.account.name,
            currency: row.account.currency,
            bank_institution: row.account.bank_institution,
            institution_name: row.account.institution_name
          };
        }

        if (!row.account_id) {
          return null;
        }

        return {
          id: row.account_id,
          name: null,
          currency: row.currency ?? null,
          bank_institution: null,
          institution_name: null
        };
      };

      for (const account of accountRows) {
        const initialNio = toNio(account.initial_balance ?? 0, account.currency);
        const initialUsd = toUsd(account.initial_balance ?? 0, account.currency);
        map.set(account.id, {
          account_id: account.id,
          account,
          incomes: { nio: 0, usd: 0 },
          expenses: { nio: 0, usd: 0 },
          transfersIn: { nio: 0, usd: 0 },
          transfersOut: { nio: 0, usd: 0 },
          initial: { nio: initialNio, usd: initialUsd }
        });
      }

      const collect = (rows, bucketKey) => {
        for (const row of rows) {
          if (row.source !== 'bank' || !row.account_id) {
            continue;
          }

          const existing = map.get(row.account_id) ?? {
            account_id: row.account_id,
            account: resolveAccountInfo(row),
            incomes: { nio: 0, usd: 0 },
            expenses: { nio: 0, usd: 0 },
            transfersIn: { nio: 0, usd: 0 },
            transfersOut: { nio: 0, usd: 0 },
            initial: { nio: 0, usd: 0 }
          };

          if (!existing.account) {
            existing.account = resolveAccountInfo(row);
          }

          const amountNio = toNio(row.amount, row.currency);
          const amountUsd = toUsd(row.amount, row.currency);
          existing[bucketKey].nio += amountNio;
          existing[bucketKey].usd += amountUsd;
          map.set(row.account_id, existing);
        }
      };

      collect(incomeRows, 'incomes');
      collect(expenseRows, 'expenses');

      for (const transfer of transferRows) {
        const amountNio = toNio(transfer.amount, transfer.currency);
        const amountUsd = toUsd(transfer.amount, transfer.currency);

        if (transfer.from_type === 'bank' && transfer.from_account_id) {
          const existing = map.get(transfer.from_account_id) ?? {
            account_id: transfer.from_account_id,
            account: null,
            incomes: { nio: 0, usd: 0 },
            expenses: { nio: 0, usd: 0 },
            transfersIn: { nio: 0, usd: 0 },
            transfersOut: { nio: 0, usd: 0 },
            initial: { nio: 0, usd: 0 }
          };
          existing.transfersOut.nio += amountNio;
          existing.transfersOut.usd += amountUsd;
          map.set(transfer.from_account_id, existing);
        }

        if (transfer.to_type === 'bank' && transfer.to_account_id) {
          const existing = map.get(transfer.to_account_id) ?? {
            account_id: transfer.to_account_id,
            account: null,
            incomes: { nio: 0, usd: 0 },
            expenses: { nio: 0, usd: 0 },
            transfersIn: { nio: 0, usd: 0 },
            transfersOut: { nio: 0, usd: 0 },
            initial: { nio: 0, usd: 0 }
          };
          existing.transfersIn.nio += amountNio;
          existing.transfersIn.usd += amountUsd;
          map.set(transfer.to_account_id, existing);
        }
      }

      const getLabel = (account) => {
        if (!account) {
          return '';
        }
        return (
          account.name ??
          account.institution_name ??
          account.bank_institution ??
          ''
        );
      };

      return Array.from(map.values())
        .map((entry) => ({
          account_id: entry.account_id,
          account: entry.account,
          incomes: entry.incomes,
          expenses: entry.expenses,
          transfers: {
            incoming: entry.transfersIn,
            outgoing: entry.transfersOut
          },
          net: {
            nio:
              entry.initial.nio +
              entry.incomes.nio +
              entry.transfersIn.nio -
              entry.expenses.nio -
              entry.transfersOut.nio,
            usd:
              entry.initial.usd +
              entry.incomes.usd +
              entry.transfersIn.usd -
              entry.expenses.usd -
              entry.transfersOut.usd
          }
        }))
        .sort((a, b) => {
          const labelA = getLabel(a.account).toLowerCase();
          const labelB = getLabel(b.account).toLowerCase();
          if (labelA === labelB) return 0;
          return labelA < labelB ? -1 : 1;
        });
    };

    const incomesTotals = sumsBySource(incomes);
    const expensesTotals = sumsBySource(expenses);
    const transferTotals = transfers.reduce(
      (acc, row) => {
        const amountNio = toNio(row.amount, row.currency);
        if (row.from_type === 'bank') {
          acc.bank.outgoing += amountNio;
        } else {
          acc.cash.outgoing += amountNio;
        }

        if (row.to_type === 'bank') {
          acc.bank.incoming += amountNio;
        } else {
          acc.cash.incoming += amountNio;
        }

        return acc;
      },
      {
        bank: { incoming: 0, outgoing: 0 },
        cash: { incoming: 0, outgoing: 0 }
      }
    );

    const bankNet =
      incomesTotals.bank - expensesTotals.bank + transferTotals.bank.incoming - transferTotals.bank.outgoing;
    const cashNet =
      incomesTotals.cash - expensesTotals.cash + transferTotals.cash.incoming - transferTotals.cash.outgoing;

    const seriesByMonth = aggregateByMonth(incomes, expenses);
    const accountsBreakdown = summarizeAccounts(incomes, expenses, transfers, accounts);

    return {
      incomes: incomesTotals,
      expenses: expensesTotals,
      balance: incomesTotals.total - expensesTotals.total,
      balanceBreakdown: {
        total: bankNet + cashNet,
        bank: bankNet,
        cash: cashNet
      },
      range: { from, to },
      accounts: accountsBreakdown,
      series: {
        byMonth: seriesByMonth
      }
    };
  });
}
