import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { parseWithSchema } from '../utils/validation.js';

const incomeSchema = z.object({
  amount: z.coerce.number().nonnegative('El monto debe ser mayor o igual a cero'),
  currency: z.string().trim().min(1).max(8).default('USD'),
  source: z.enum(['cash', 'bank']).default('cash'),
  date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha inválida'),
  category_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(255).optional().nullable()
});

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category_id: z.string().uuid().optional()
});

function mapIncomeRow(row) {
  return {
    id: row.id,
    amount: Number(row.amount),
    currency: row.currency,
    source: row.source ?? 'cash',
    date: row.date,
    note: row.note,
    category_id: row.category_id,
    category_name: row.category?.name ?? null,
    created_at: row.created_at
  };
}

async function ensureCategoryIsIncome(request, reply, categoryId) {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('user_id', request.user.id)
    .eq('type', 'income')
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    request.log.error(error, 'Error validando categoría de ingreso');
    reply.code(500).send({ message: 'No se pudo validar la categoría seleccionada' });
    return false;
  }

  if (!data) {
    reply.code(400).send({ message: 'La categoría seleccionada no es válida para ingresos' });
    return false;
  }

  return true;
}

export default async function incomesRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const filters = parseWithSchema(querySchema, request.query ?? {});
    let query = supabaseAdmin
      .from('incomes')
      .select('id, amount, currency, source, date, note, category_id, created_at, category:categories!left(id,name)')
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
      request.log.error(error, 'Error al listar ingresos');
      return reply.code(500).send({ message: 'No se pudieron obtener los ingresos' });
    }

    return data.map(mapIncomeRow);
  });

  fastify.post('/', async (request, reply) => {
    const payload = parseWithSchema(incomeSchema, request.body ?? {});

    if (payload.category_id) {
      const categoryIsValid = await ensureCategoryIsIncome(request, reply, payload.category_id);
      if (!categoryIsValid) return;
    }

    const { data, error } = await supabaseAdmin
      .from('incomes')
      .insert({ ...payload, user_id: request.user.id })
      .select('id, amount, currency, source, date, note, category_id, created_at')
      .single();

    if (error) {
      request.log.error(error, 'Error al crear ingreso');
      return reply.code(500).send({ message: 'No se pudo crear el ingreso' });
    }

    return reply.code(201).send(data);
  });

  fastify.put('/:id', async (request, reply) => {
    const payload = parseWithSchema(incomeSchema.partial(), request.body ?? {});
    if (Object.keys(payload).length === 0) {
      return reply.code(400).send({ message: 'No hay cambios que aplicar' });
    }

    if (payload.category_id) {
      const categoryIsValid = await ensureCategoryIsIncome(request, reply, payload.category_id);
      if (!categoryIsValid) return;
    }

    const { data, error } = await supabaseAdmin
      .from('incomes')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .select('id, amount, currency, source, date, note, category_id, updated_at')
      .single();

    if (error || !data) {
      request.log.error(error, 'Error al actualizar ingreso');
      return reply.code(404).send({ message: 'Ingreso no encontrado' });
    }

    return data;
  });

  fastify.delete('/:id', async (request, reply) => {
    const { error } = await supabaseAdmin
      .from('incomes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null);

    if (error) {
      request.log.error(error, 'Error al eliminar ingreso');
      return reply.code(404).send({ message: 'Ingreso no encontrado' });
    }

    return reply.code(204).send();
  });
}
