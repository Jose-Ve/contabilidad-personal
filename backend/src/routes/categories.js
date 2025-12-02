import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { parseWithSchema, isoDateOrNull } from '../utils/validation.js';

const categorySchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(60),
  type: z.enum(['income', 'expense'])
});

const querySchema = z.object({
  type: z.enum(['income', 'expense']).optional()
});

export default async function categoriesRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  const ensureUniqueName = async (request, reply, { name, type }, excludeId) => {
    let query = supabaseAdmin
      .from('categories')
      .select('id')
      .eq('user_id', request.user.id)
      .eq('type', type)
      .ilike('name', name)
      .is('deleted_at', null)
      .limit(1);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query.maybeSingle();

    if (error && error.code !== 'PGRST116') {
      request.log.error(error, 'Error validando nombre de categoría');
      reply.code(500).send({ message: 'No se pudo validar la categoría' });
      return false;
    }

    if (data) {
      reply.code(409).send({ message: 'Ya existe una categoría con ese nombre' });
      return false;
    }

    return true;
  };
  fastify.get('/', async (request, reply) => {
    const { type } = parseWithSchema(querySchema, request.query ?? {});
    let query = supabaseAdmin
      .from('categories')
      .select('id, name, type, created_at, updated_at')
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;
    if (error) {
      request.log.error(error, 'Error al obtener categorías');
      return reply.code(500).send({ message: 'No se pudieron obtener las categorías' });
    }

    return data;
  });

  fastify.post('/', async (request, reply) => {
    const payload = parseWithSchema(categorySchema, request.body ?? {});
    const normalizedName = payload.name.trim();

    const isUnique = await ensureUniqueName(request, reply, { name: normalizedName, type: payload.type });
    if (!isUnique) {
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert({ ...payload, name: normalizedName, user_id: request.user.id })
      .select('id, name, type, created_at')
      .single();

    if (error) {
      request.log.error(error, 'Error al crear categoría');
      return reply.code(500).send({ message: 'No se pudo crear la categoría' });
    }

    return reply.code(201).send(data);
  });

  fastify.put('/:id', async (request, reply) => {
    const payload = parseWithSchema(categorySchema.partial(), request.body ?? {});
    if (Object.keys(payload).length === 0) {
      return reply.code(400).send({ message: 'No hay cambios que aplicar' });
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('categories')
      .select('id, type')
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .single();

    if (fetchError || !existing) {
      request.log.error(fetchError, 'Categoría no encontrada para actualizar');
      return reply.code(404).send({ message: 'Categoría no encontrada' });
    }

    const updates = { ...payload };
    if (updates.name) {
      updates.name = updates.name.trim();
    }

    const finalType = updates.type ?? existing.type;

    if (updates.name) {
      const isUnique = await ensureUniqueName(request, reply, { name: updates.name, type: finalType }, request.params.id);
      if (!isUnique) {
        return;
      }
    }

    updates.type = finalType;

    const { data, error } = await supabaseAdmin
      .from('categories')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .select('id, name, type, updated_at')
      .single();

    if (error || !data) {
      request.log.error(error, 'Error al actualizar categoría');
      return reply.code(404).send({ message: 'Categoría no encontrada' });
    }

    return data;
  });

  fastify.delete('/:id', async (request, reply) => {
    const deletedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('categories')
      .update({ deleted_at: deletedAt })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null);

    if (error) {
      request.log.error(error, 'Error al eliminar categoría');
      return reply.code(404).send({ message: 'Categoría no encontrada' });
    }

    return reply.code(204).send();
  });
}
