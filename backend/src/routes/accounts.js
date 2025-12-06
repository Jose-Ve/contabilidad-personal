import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { parseWithSchema } from '../utils/validation.js';
import { ACCOUNT_INSTITUTIONS, normalizeCurrency, normalizeInstitution, sanitizeAccountName, sanitizeOptionalText } from '../utils/accounts.js';

const baseAccountSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres.').max(120, 'El nombre es demasiado largo.'),
  bank_institution: z.string().trim(),
  institution_name: z.string().trim().max(120).nullable().optional(),
  currency: z.string().trim(),
  initial_balance: z.coerce.number().optional()
});

const createAccountSchema = baseAccountSchema;
const updateAccountSchema = baseAccountSchema.partial();

function mapAccountRow(row) {
  return {
    id: row.id,
    name: row.name,
    bank_institution: row.bank_institution,
    institution_name: row.institution_name,
    currency: row.currency,
    initial_balance: row.initial_balance !== null ? Number(row.initial_balance) : null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function validateInstitutionOrReply(reply, institution) {
  if (!institution) {
    reply.code(400).send({ message: 'Selecciona la institución financiera.' });
    return false;
  }
  if (!ACCOUNT_INSTITUTIONS.includes(institution)) {
    reply.code(400).send({ message: 'La institución seleccionada no es válida.' });
    return false;
  }
  return true;
}

export default async function accountsRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const { data, error } = await supabaseAdmin
      .from('accounts')
      .select('id, name, bank_institution, institution_name, currency, initial_balance, created_at, updated_at')
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      request.log.error(error, 'Error al listar cuentas');
      return reply.code(500).send({ message: 'No se pudieron obtener las cuentas bancarias.' });
    }

    return (data ?? []).map(mapAccountRow);
  });

  fastify.post('/', async (request, reply) => {
    const payload = parseWithSchema(createAccountSchema, request.body ?? {});

    const sanitizedName = sanitizeAccountName(payload.name);
    if (!sanitizedName) {
      return reply.code(400).send({ message: 'El nombre de la cuenta es obligatorio.' });
    }

    const institution = normalizeInstitution(payload.bank_institution);
    if (!validateInstitutionOrReply(reply, institution)) {
      return;
    }

    const otherInstitutionName = sanitizeOptionalText(payload.institution_name);
    if (institution === 'Otro' && !otherInstitutionName) {
      return reply.code(400).send({ message: 'Indica el nombre del banco cuando selecciones "Otro".' });
    }

    const currency = normalizeCurrency(payload.currency);
    if (!currency) {
      return reply.code(400).send({ message: 'Selecciona una moneda válida.' });
    }

    const insertPayload = {
      name: sanitizedName,
      bank_institution: institution,
      institution_name: institution === 'Otro' ? otherInstitutionName : sanitizeOptionalText(payload.institution_name),
      currency,
      initial_balance: payload.initial_balance ?? null,
      user_id: request.user.id
    };

    const { data, error } = await supabaseAdmin
      .from('accounts')
      .insert(insertPayload)
      .select('id, name, bank_institution, institution_name, currency, initial_balance, created_at, updated_at')
      .single();

    if (error) {
      request.log.error(error, 'Error al crear cuenta');
      return reply.code(500).send({ message: 'No se pudo crear la cuenta bancaria.' });
    }

    return reply.code(201).send(mapAccountRow(data));
  });

  fastify.put('/:id', async (request, reply) => {
    const payload = parseWithSchema(updateAccountSchema, request.body ?? {});
    if (Object.keys(payload).length === 0) {
      return reply.code(400).send({ message: 'No hay cambios que aplicar.' });
    }

    const { data: current, error: currentError } = await supabaseAdmin
      .from('accounts')
      .select('id, name, bank_institution, institution_name, currency, initial_balance')
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (currentError) {
      request.log.error(currentError, 'Error obteniendo cuenta para actualizar');
      return reply.code(500).send({ message: 'No se pudo actualizar la cuenta.' });
    }

    if (!current) {
      return reply.code(404).send({ message: 'Cuenta no encontrada.' });
    }

    const nextName = payload.name !== undefined ? sanitizeAccountName(payload.name) : current.name;
    if (!nextName) {
      return reply.code(400).send({ message: 'El nombre de la cuenta es obligatorio.' });
    }

    const institution = payload.bank_institution !== undefined ? normalizeInstitution(payload.bank_institution) : current.bank_institution;
    if (!validateInstitutionOrReply(reply, institution)) {
      return;
    }

    const nextCurrency = payload.currency !== undefined ? normalizeCurrency(payload.currency) : current.currency;
    if (!nextCurrency) {
      return reply.code(400).send({ message: 'Selecciona una moneda válida.' });
    }

    const nextInstitutionName = payload.institution_name !== undefined ? sanitizeOptionalText(payload.institution_name) : current.institution_name;
    if (institution === 'Otro' && !nextInstitutionName) {
      return reply.code(400).send({ message: 'Indica el nombre del banco cuando selecciones "Otro".' });
    }

    const effectiveInstitutionName =
      institution === 'Otro' ? nextInstitutionName : sanitizeOptionalText(payload.institution_name ?? current.institution_name);

    const updates = {
      name: nextName,
      bank_institution: institution,
      institution_name: effectiveInstitutionName,
      currency: nextCurrency,
      initial_balance: payload.initial_balance !== undefined ? payload.initial_balance : current.initial_balance
    };

    const { data, error } = await supabaseAdmin
      .from('accounts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null)
      .select('id, name, bank_institution, institution_name, currency, initial_balance, updated_at')
      .single();

    if (error || !data) {
      request.log.error(error, 'Error al actualizar cuenta');
      return reply.code(500).send({ message: 'No se pudo actualizar la cuenta.' });
    }

    return mapAccountRow({ ...current, ...data });
  });

  fastify.delete('/:id', async (request, reply) => {
    const { error } = await supabaseAdmin
      .from('accounts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', request.params.id)
      .eq('user_id', request.user.id)
      .is('deleted_at', null);

    if (error) {
      request.log.error(error, 'Error al eliminar cuenta');
      return reply.code(500).send({ message: 'No se pudo eliminar la cuenta bancaria.' });
    }

    return reply.code(204).send();
  });
}
