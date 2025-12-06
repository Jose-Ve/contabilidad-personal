import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { parseWithSchema } from '../utils/validation.js';
import { computeAccountBalance } from '../utils/account-balance.js';
import { ensureAccountCurrency, loadUserAccount, normalizeCurrency } from '../utils/accounts.js';

const expenseSchema = z.object({
  amount: z.coerce.number().nonnegative('El monto debe ser mayor o igual a cero'),
  currency: z.string().trim().min(1).max(8).default('USD'),
  source: z.enum(['cash', 'bank']).default('cash'),
  date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha inválida'),
  category_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(255).optional().nullable()
});

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category_id: z.string().uuid().optional()
});

function mapExpenseRow(row) {
  return {
    id: row.id,
    amount: Number(row.amount),
    currency: row.currency,
    source: row.source ?? 'cash',
    account_id: row.account_id ?? null,
    account: row.account
      ? {
          id: row.account.id,
          name: row.account.name,
          currency: row.account.currency,
          bank_institution: row.account.bank_institution,
          institution_name: row.account.institution_name
        }
      : null,
    date: row.date,
    note: row.note,
    category_id: row.category_id,
    category_name: row.category?.name ?? null,
    created_at: row.created_at
  };
}

async function ensureCategoryIsExpense(request, reply, categoryId) {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('user_id', request.user.id)
    .eq('type', 'expense')
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    request.log.error(error, 'Error validando categoría de gasto');
    reply.code(500).send({ message: 'No se pudo validar la categoría seleccionada' });
    return false;
  }

  if (!data) {
    reply.code(400).send({ message: 'La categoría seleccionada no es válida para gastos' });
    return false;
  }

  return true;
}

export default async function expensesRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const filters = parseWithSchema(querySchema, request.query ?? {});
    let query = supabaseAdmin
      .from('expenses')
      .select('id, amount, currency, source, account_id, date, note, category_id, created_at, category:categories!left(id,name), account:accounts!left(id,name,currency,bank_institution,institution_name)')
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .order('date', { ascending: false });

    if (filters.from) {
      query = query.gte('date', filters.from);
    }
    if (filters.to) {
      query = query.lte('date', filters.to);
    }
    if (filters.category_id) {
      query = query.eq('category_id', filters.category_id);
    }

    const { data, error } = await query;
    if (error) {
      request.log.error(error, 'Error al listar gastos');
      return reply.code(500).send({ message: 'No se pudieron obtener los gastos' });
    }

    return data.map(mapExpenseRow);
  });

  fastify.post('/', async (request, reply) => {
    const payload = parseWithSchema(expenseSchema, request.body ?? {});

    if (payload.category_id) {
      const categoryIsValid = await ensureCategoryIsExpense(request, reply, payload.category_id);
      if (!categoryIsValid) return;
    }

    let accountRecord = null;
    if (payload.source === 'bank') {
      if (!payload.account_id) {
        return reply.code(400).send({ message: 'Debes seleccionar una cuenta bancaria.' });
      }

      try {
        accountRecord = await loadUserAccount(supabaseAdmin, request.user.id, payload.account_id);
      } catch (accountError) {
        request.log.error(accountError, 'Error obteniendo cuenta para gasto');
        return reply.code(500).send({ message: 'No se pudo validar la cuenta seleccionada.' });
      }

      if (!accountRecord) {
        return reply.code(400).send({ message: 'La cuenta seleccionada no existe o ya no está disponible.' });
      }

      if (!ensureAccountCurrency(accountRecord, payload.currency ?? accountRecord.currency)) {
        return reply.code(400).send({ message: 'La moneda no coincide con la cuenta seleccionada.' });
      }
    } else {
      payload.account_id = null;
    }

    const normalizedCurrency = accountRecord ? accountRecord.currency : normalizeCurrency(payload.currency) ?? 'USD';

    let accountBalance = 0;
    try {
      accountBalance = await computeAccountBalance(supabaseAdmin, request.user.id, {
        source: payload.source,
        accountId: payload.source === 'bank' ? accountRecord?.id ?? payload.account_id : null,
        currency: normalizedCurrency,
        account: accountRecord
      });
    } catch (balanceError) {
      request.log.error(balanceError, 'Error calculando saldo para gasto');
      return reply.code(500).send({ message: 'No se pudo verificar el saldo disponible.' });
    }

    if (accountBalance < Number(payload.amount ?? 0)) {
      return reply.code(400).send({ message: 'No hay saldo suficiente en la cuenta seleccionada.' });
    }

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .insert({
        amount: payload.amount,
        currency: normalizedCurrency,
        source: payload.source,
        account_id: payload.account_id,
        date: payload.date,
        category_id: payload.category_id ?? null,
        note: payload.note ?? null,
        user_id: request.user.id
      })
      .select('id, amount, currency, source, account_id, date, note, category_id, created_at')
      .single();

    if (error) {
      request.log.error(error, 'Error al crear gasto');
      return reply.code(500).send({ message: 'No se pudo crear el gasto' });
    }

    return reply.code(201).send(data);
  });

  fastify.put('/:id', async (request, reply) => {
    const payload = parseWithSchema(expenseSchema.partial(), request.body ?? {});
    if (Object.keys(payload).length === 0) {
      return reply.code(400).send({ message: 'No hay cambios que aplicar' });
    }

    if (payload.category_id) {
      const categoryIsValid = await ensureCategoryIsExpense(request, reply, payload.category_id);
      if (!categoryIsValid) return;
    }

    const { data: current, error: currentError } = await supabaseAdmin
      .from('expenses')
      .select('id, amount, currency, source, account_id')
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (currentError) {
      request.log.error(currentError, 'Error al obtener gasto para actualizar');
      return reply.code(500).send({ message: 'No se pudo actualizar el gasto' });
    }

    if (!current) {
      return reply.code(404).send({ message: 'Gasto no encontrado' });
    }

    const nextSource = payload.source ?? current.source ?? 'cash';
    let nextAccountId = null;
    let accountRecord = null;
    if (nextSource === 'bank') {
      const candidateAccountId = payload.account_id ?? current.account_id;
      if (!candidateAccountId) {
        return reply.code(400).send({ message: 'Debes seleccionar una cuenta bancaria.' });
      }
      try {
        accountRecord = await loadUserAccount(supabaseAdmin, request.user.id, candidateAccountId);
      } catch (accountError) {
        request.log.error(accountError, 'Error obteniendo cuenta para actualizar gasto');
        return reply.code(500).send({ message: 'No se pudo validar la cuenta seleccionada.' });
      }

      if (!accountRecord) {
        return reply.code(400).send({ message: 'La cuenta seleccionada no existe o ya no está disponible.' });
      }
      nextAccountId = accountRecord.id;
    }

    const nextCurrency = accountRecord ? accountRecord.currency : normalizeCurrency(payload.currency ?? current.currency) ?? 'NIO';
    const nextAmount = payload.amount !== undefined ? Number(payload.amount) : Number(current.amount);

    if (accountRecord && !ensureAccountCurrency(accountRecord, nextCurrency)) {
      return reply.code(400).send({ message: 'La moneda no coincide con la cuenta seleccionada.' });
    }

    let currentBalance = 0;
    try {
      currentBalance = await computeAccountBalance(supabaseAdmin, request.user.id, {
        source: nextSource,
        accountId: nextSource === 'bank' ? nextAccountId : null,
        currency: nextCurrency,
        account: accountRecord
      });
    } catch (balanceError) {
      request.log.error(balanceError, 'Error calculando saldo para actualizar gasto');
      return reply.code(500).send({ message: 'No se pudo verificar el saldo disponible.' });
    }

    const switchingAccount =
      current.source !== nextSource || (nextSource === 'bank' ? current.account_id !== nextAccountId : current.account_id !== null);
    const availableBeforeUpdate = switchingAccount ? currentBalance : currentBalance + Number(current.amount ?? 0);

    if (availableBeforeUpdate < nextAmount) {
      return reply.code(400).send({ message: 'No hay saldo suficiente en la cuenta seleccionada.' });
    }

    if (nextSource !== 'bank') {
      nextAccountId = null;
    }

    const updates = {
      amount: nextAmount,
      currency: nextCurrency,
      source: nextSource,
      account_id: nextAccountId,
      date: payload.date,
      category_id: payload.category_id,
      note: payload.note
    };

    const sanitizedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .update({ ...sanitizedUpdates, updated_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .select('id, amount, currency, source, account_id, date, note, category_id, updated_at')
      .single();

    if (error || !data) {
      request.log.error(error, 'Error al actualizar gasto');
      return reply.code(404).send({ message: 'Gasto no encontrado' });
    }

    return data;
  });

  fastify.delete('/:id', async (request, reply) => {
    const { error } = await supabaseAdmin
      .from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null);

    if (error) {
      request.log.error(error, 'Error al eliminar gasto');
      return reply.code(404).send({ message: 'Gasto no encontrado' });
    }

    return reply.code(204).send();
  });
}
