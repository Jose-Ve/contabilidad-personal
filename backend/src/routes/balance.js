import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { parseWithSchema } from '../utils/validation.js';

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
      const amount = Number(item.amount);
      const isIncome = key === 'incomes';
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
      .select('amount, date, source')
      .eq('user_id', request.user.id)
      .is('deleted_at', null);

    let expensesQuery = supabaseAdmin
      .from('expenses')
      .select('amount, date, source')
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

    const [incomesResult, expensesResult] = await Promise.all([incomesQuery, expensesQuery]);

    if (incomesResult.error || expensesResult.error) {
      request.log.error({ incomesError: incomesResult.error, expensesError: expensesResult.error }, 'Error al calcular balance');
      return reply.code(500).send({ message: 'No se pudo calcular el balance' });
    }

    const incomes = incomesResult.data ?? [];
    const expenses = expensesResult.data ?? [];

    const sumsBySource = (collection) =>
      collection.reduce(
        (acc, row) => {
          const amount = Number(row.amount);
          const key = row.source === 'bank' ? 'bank' : 'cash';
          acc.total += amount;
          acc[key] += amount;
          return acc;
        },
        { total: 0, bank: 0, cash: 0 }
      );

    const incomesTotals = sumsBySource(incomes);
    const expensesTotals = sumsBySource(expenses);
    const seriesByMonth = aggregateByMonth(incomes, expenses);

    return {
      incomes: incomesTotals,
      expenses: expensesTotals,
      balance: incomesTotals.total - expensesTotals.total,
      range: { from, to },
      series: {
        byMonth: seriesByMonth
      }
    };
  });
}
