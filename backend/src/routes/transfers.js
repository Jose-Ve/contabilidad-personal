import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { parseWithSchema } from '../utils/validation.js';
import { computeAccountBalance } from '../utils/account-balance.js';
import { ensureAccountCurrency, loadUserAccount, normalizeCurrency } from '../utils/accounts.js';

function mapTransferRow(row) {
  return {
    id: row.id,
    amount: Number(row.amount ?? 0),
    currency: row.currency,
    source_type: row.from_type,
    source_account_id: row.from_account_id,
    source_account: row.from_account
      ? {
          id: row.from_account.id,
          name: row.from_account.name,
          currency: row.from_account.currency,
          bank_institution: row.from_account.bank_institution,
          institution_name: row.from_account.institution_name
        }
      : null,
    destination_type: row.to_type,
    destination_account_id: row.to_account_id,
    destination_account: row.to_account
      ? {
          id: row.to_account.id,
          name: row.to_account.name,
          currency: row.to_account.currency,
          bank_institution: row.to_account.bank_institution,
          institution_name: row.to_account.institution_name
        }
      : null,
    date: row.date,
    note: row.note,
    created_at: row.created_at
  };
}

const accountTypeSchema = z.enum(['cash', 'bank']);

const transferSchema = z.object({
  amount: z.coerce.number().positive('El monto debe ser mayor que cero'),
  currency: z.string().trim().min(1).max(8),
  date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha inválida'),
  source_type: accountTypeSchema,
  source_account_id: z.string().uuid().nullable().optional(),
  destination_type: accountTypeSchema,
  destination_account_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(255).optional().nullable()
});

export default async function transfersRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const { data, error } = await supabaseAdmin
      .from('transfers')
      .select(
        'id, amount, currency, from_type, from_account_id, to_type, to_account_id, date, note, created_at, from_account:accounts!transfers_from_account_id_fkey(id,name,currency,bank_institution,institution_name), to_account:accounts!transfers_to_account_id_fkey(id,name,currency,bank_institution,institution_name)'
      )
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      request.log.error(error, 'Error al listar transferencias');
      return reply.code(500).send({ message: 'No se pudieron obtener las transferencias.' });
    }

    return (data ?? []).map(mapTransferRow);
  });

  fastify.post('/', async (request, reply) => {
    const payload = parseWithSchema(transferSchema, request.body ?? {});

    let sourceAccount = null;
    let destinationAccount = null;

    if (payload.source_type === 'bank') {
      if (!payload.source_account_id) {
        return reply.code(400).send({ message: 'Debes seleccionar la cuenta bancaria de origen.' });
      }
      try {
        sourceAccount = await loadUserAccount(supabaseAdmin, request.user.id, payload.source_account_id);
      } catch (accountError) {
        request.log.error(accountError, 'Error obteniendo cuenta origen para transferencia');
        return reply.code(500).send({ message: 'No se pudo validar la cuenta de origen.' });
      }
      if (!sourceAccount) {
        return reply.code(400).send({ message: 'La cuenta de origen no existe o ya no está disponible.' });
      }
    } else {
      payload.source_account_id = null;
    }

    if (payload.destination_type === 'bank') {
      if (!payload.destination_account_id) {
        return reply.code(400).send({ message: 'Debes seleccionar la cuenta bancaria de destino.' });
      }
      try {
        destinationAccount = await loadUserAccount(supabaseAdmin, request.user.id, payload.destination_account_id);
      } catch (accountError) {
        request.log.error(accountError, 'Error obteniendo cuenta destino para transferencia');
        return reply.code(500).send({ message: 'No se pudo validar la cuenta de destino.' });
      }
      if (!destinationAccount) {
        return reply.code(400).send({ message: 'La cuenta de destino no existe o ya no está disponible.' });
      }
    } else {
      payload.destination_account_id = null;
    }

    if (
      payload.source_type === 'bank' &&
      payload.destination_type === 'bank' &&
      payload.source_account_id === payload.destination_account_id
    ) {
      return reply.code(400).send({ message: 'El origen y destino no pueden ser la misma cuenta.' });
    }

    const normalizedCurrency = normalizeCurrency(
      sourceAccount?.currency ?? destinationAccount?.currency ?? payload.currency
    ) ?? 'NIO';

    if (sourceAccount && !ensureAccountCurrency(sourceAccount, normalizedCurrency)) {
      return reply.code(400).send({ message: 'La moneda no coincide con la cuenta de origen seleccionada.' });
    }

    if (destinationAccount && !ensureAccountCurrency(destinationAccount, normalizedCurrency)) {
      return reply.code(400).send({ message: 'La moneda no coincide con la cuenta de destino seleccionada.' });
    }

    let availableBalance = 0;
    try {
      availableBalance = await computeAccountBalance(supabaseAdmin, request.user.id, {
        source: payload.source_type,
        accountId: payload.source_type === 'bank' ? payload.source_account_id : null,
        currency: normalizedCurrency,
        account: sourceAccount
      });
    } catch (balanceError) {
      request.log.error(balanceError, 'Error calculando saldo para transferencia');
      return reply.code(500).send({ message: 'No se pudo verificar el saldo disponible.' });
    }

    if (availableBalance < Number(payload.amount ?? 0)) {
      return reply.code(400).send({ message: 'No hay saldo suficiente en la cuenta origen.' });
    }

    const insertPayload = {
      amount: payload.amount,
      currency: normalizedCurrency,
      date: payload.date,
      note: payload.note ?? null,
      from_type: payload.source_type,
      from_account_id: payload.source_account_id,
      to_type: payload.destination_type,
      to_account_id: payload.destination_account_id,
      user_id: request.user.id
    };

    const { data, error } = await supabaseAdmin.from('transfers').insert(insertPayload).select('*').single();

    if (error) {
      request.log.error(error, 'Error al registrar transferencia');
      return reply.code(500).send({ message: 'No se pudo registrar la transferencia.' });
    }

    return reply.code(201).send(data);
  });

  fastify.put('/:id', async (request, reply) => {
    const payload = parseWithSchema(transferSchema, request.body ?? {});

    const { data: current, error: currentError } = await supabaseAdmin
      .from('transfers')
      .select('id, amount, currency, from_type, from_account_id, to_type, to_account_id')
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (currentError) {
      request.log.error(currentError, 'Error obteniendo transferencia para actualizar');
      return reply.code(500).send({ message: 'No se pudo actualizar la transferencia.' });
    }

    if (!current) {
      return reply.code(404).send({ message: 'Transferencia no encontrada.' });
    }

    let sourceAccount = null;
    let destinationAccount = null;

    if (payload.source_type === 'bank') {
      if (!payload.source_account_id) {
        return reply.code(400).send({ message: 'Debes seleccionar la cuenta bancaria de origen.' });
      }
      try {
        sourceAccount = await loadUserAccount(supabaseAdmin, request.user.id, payload.source_account_id);
      } catch (accountError) {
        request.log.error(accountError, 'Error obteniendo cuenta origen para actualizar transferencia');
        return reply.code(500).send({ message: 'No se pudo validar la cuenta de origen.' });
      }
      if (!sourceAccount) {
        return reply.code(400).send({ message: 'La cuenta de origen no existe o ya no está disponible.' });
      }
    } else {
      payload.source_account_id = null;
    }

    if (payload.destination_type === 'bank') {
      if (!payload.destination_account_id) {
        return reply.code(400).send({ message: 'Debes seleccionar la cuenta bancaria de destino.' });
      }
      try {
        destinationAccount = await loadUserAccount(supabaseAdmin, request.user.id, payload.destination_account_id);
      } catch (accountError) {
        request.log.error(accountError, 'Error obteniendo cuenta destino para actualizar transferencia');
        return reply.code(500).send({ message: 'No se pudo validar la cuenta de destino.' });
      }
      if (!destinationAccount) {
        return reply.code(400).send({ message: 'La cuenta de destino no existe o ya no está disponible.' });
      }
    } else {
      payload.destination_account_id = null;
    }

    if (
      payload.source_type === 'bank' &&
      payload.destination_type === 'bank' &&
      payload.source_account_id === payload.destination_account_id
    ) {
      return reply.code(400).send({ message: 'El origen y destino no pueden ser la misma cuenta.' });
    }

    const normalizedCurrency =
      normalizeCurrency(sourceAccount?.currency ?? destinationAccount?.currency ?? payload.currency) ?? 'NIO';

    if (sourceAccount && !ensureAccountCurrency(sourceAccount, normalizedCurrency)) {
      return reply.code(400).send({ message: 'La moneda no coincide con la cuenta de origen seleccionada.' });
    }

    if (destinationAccount && !ensureAccountCurrency(destinationAccount, normalizedCurrency)) {
      return reply.code(400).send({ message: 'La moneda no coincide con la cuenta de destino seleccionada.' });
    }

    let availableBalance = 0;
    try {
      availableBalance = await computeAccountBalance(supabaseAdmin, request.user.id, {
        source: payload.source_type,
        accountId: payload.source_type === 'bank' ? payload.source_account_id : null,
        currency: normalizedCurrency,
        account: sourceAccount
      });
    } catch (balanceError) {
      request.log.error(balanceError, 'Error calculando saldo para actualizar transferencia');
      return reply.code(500).send({ message: 'No se pudo verificar el saldo disponible.' });
    }

    const currentCurrency = normalizeCurrency(current.currency) ?? 'NIO';
    const isSameSource =
      current.from_type === payload.source_type &&
      (current.from_account_id ?? null) === (payload.source_account_id ?? null) &&
      currentCurrency === normalizedCurrency;

    const availableIncludingCurrent = isSameSource
      ? availableBalance + Number(current.amount ?? 0)
      : availableBalance;

    if (availableIncludingCurrent < Number(payload.amount ?? 0)) {
      return reply.code(400).send({ message: 'No hay saldo suficiente en la cuenta origen.' });
    }

    const updatePayload = {
      amount: payload.amount,
      currency: normalizedCurrency,
      date: payload.date,
      note: payload.note ?? null,
      from_type: payload.source_type,
      from_account_id: payload.source_type === 'bank' ? payload.source_account_id : null,
      to_type: payload.destination_type,
      to_account_id: payload.destination_type === 'bank' ? payload.destination_account_id : null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('transfers')
      .update(updatePayload)
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .select(
        'id, amount, currency, from_type, from_account_id, to_type, to_account_id, date, note, created_at, from_account:accounts!transfers_from_account_id_fkey(id,name,currency,bank_institution,institution_name), to_account:accounts!transfers_to_account_id_fkey(id,name,currency,bank_institution,institution_name)'
      )
      .single();

    if (error) {
      request.log.error(error, 'Error al actualizar transferencia');
      return reply.code(500).send({ message: 'No se pudo actualizar la transferencia.' });
    }

    return mapTransferRow(data);
  });

  fastify.delete('/:id', async (request, reply) => {
    const { error } = await supabaseAdmin
      .from('transfers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null);

    if (error) {
      request.log.error(error, 'Error al eliminar transferencia');
      return reply.code(500).send({ message: 'No se pudo eliminar la transferencia.' });
    }

    return reply.code(204).send();
  });
}
