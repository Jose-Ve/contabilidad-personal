import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { parseWithSchema } from '../utils/validation.js';

const nameField = z.string().trim().min(2).max(60);

const genderField = z.enum(['female', 'male']);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  first_name: nameField.optional(),
  last_name: nameField.optional(),
  gender: genderField.optional(),
  full_name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(['user', 'admin']).default('user')
});

const updateRoleSchema = z.object({
  role: z.enum(['user', 'admin'])
});

const updateStateSchema = z.object({
  active: z.boolean()
});

const updateProfileSchema = z.object({
  first_name: nameField,
  last_name: nameField,
  gender: genderField
});

const EXTENDED_SELECT = 'id, email, full_name, first_name, last_name, gender, role, created_at, updated_at, deleted_at';
const BASIC_SELECT = 'id, email, full_name, role, created_at, updated_at, deleted_at';

const COLUMN_NOT_FOUND = '42703';

const normalizeProfile = (profile) => ({
  ...profile,
  first_name: profile?.first_name ?? null,
  last_name: profile?.last_name ?? null,
  gender: profile?.gender ?? null,
  active: profile?.deleted_at === null || profile?.deleted_at === undefined
});

async function fetchEmailConfirmationMap(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return new Map();
  }

  const map = new Map();
  const targetIds = new Set(userIds);
  const perPage = Math.min(1000, Math.max(targetIds.size, 100));
  let page = 1;
  let shouldContinue = true;

  while (shouldContinue) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    const users = data?.users ?? [];
    for (const authUser of users) {
      if (!targetIds.has(authUser.id)) {
        continue;
      }
      map.set(authUser.id, authUser.email_confirmed_at ?? null);
      if (map.size === targetIds.size) {
        break;
      }
    }

    const total = typeof data?.total === 'number' ? data.total : null;
    const hasMore = total !== null ? page * perPage < total : users.length === perPage;
    shouldContinue = hasMore && map.size < targetIds.size;
    page += 1;
  }

  return map;
}

async function appendEmailConfirmation(profiles, logger) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return profiles;
  }

  try {
    const confirmationMap = await fetchEmailConfirmationMap(profiles.map((profile) => profile.id));
    return profiles.map((profile) => ({
      ...profile,
      email_confirmed_at: confirmationMap.get(profile.id) ?? null
    }));
  } catch (error) {
    logger?.error?.(error, 'No se pudo obtener estado de confirmación de correos');
    return profiles.map((profile) => ({
      ...profile,
      email_confirmed_at: null
    }));
  }
}

async function updateProfileWithFallback(id, values, { allowFallback = true } = {}) {
  const result = await supabaseAdmin
    .from('profiles')
    .update(values)
    .eq('id', id)
    .select(EXTENDED_SELECT)
    .single();

  if (!result.error) {
    return { data: normalizeProfile(result.data) };
  }

  if (result.error.code === 'PGRST116') {
    return { notFound: true };
  }

  if (allowFallback && profileColumnsMissing(result.error)) {
    const fallbackValues = { ...values };
    delete fallbackValues.first_name;
    delete fallbackValues.last_name;
    delete fallbackValues.gender;

    const fallback = await supabaseAdmin
      .from('profiles')
      .update(fallbackValues)
      .eq('id', id)
      .select(BASIC_SELECT)
      .single();

    if (fallback.error?.code === 'PGRST116') {
      return { notFound: true };
    }

    if (fallback.error) {
      return { error: fallback.error };
    }

    return {
      data: normalizeProfile({
        ...fallback.data,
        first_name: values.first_name ?? fallback.data.first_name ?? null,
        last_name: values.last_name ?? fallback.data.last_name ?? null,
        gender: values.gender ?? fallback.data.gender ?? null
      })
    };
  }

  return { error: result.error };
}

async function listProfilesWithFallback(logger) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(EXTENDED_SELECT)
    .order('created_at', { ascending: false });

  if (!error) {
    const normalized = data.map(normalizeProfile);
    return appendEmailConfirmation(normalized, logger);
  }

  if (error.code === COLUMN_NOT_FOUND) {
    const fallback = await supabaseAdmin
      .from('profiles')
      .select(BASIC_SELECT)
      .order('created_at', { ascending: false });
    if (fallback.error) {
      throw fallback.error;
    }
    const normalized = fallback.data.map(normalizeProfile);
    return appendEmailConfirmation(normalized, logger);
  }

  throw error;
}

async function getProfileByIdWithFallback(id) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select(EXTENDED_SELECT)
    .eq('id', id)
    .single();

  if (!error) {
    return normalizeProfile(data);
  }

  if (error.code === COLUMN_NOT_FOUND) {
    const fallback = await supabaseAdmin
      .from('profiles')
      .select(BASIC_SELECT)
      .eq('id', id)
      .single();

    if (fallback.error) {
      throw fallback.error;
    }

    return normalizeProfile(fallback.data);
  }

  throw error;
}

async function insertProfileWithFallback(values) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert(values)
    .select(EXTENDED_SELECT)
    .single();

  if (!error) {
    return normalizeProfile(data);
  }

  if (error.code === COLUMN_NOT_FOUND) {
    const minimalValues = {
      id: values.id,
      email: values.email,
      role: values.role,
      full_name: values.full_name ?? null
    };

    const fallback = await supabaseAdmin
      .from('profiles')
      .insert(minimalValues)
      .select(BASIC_SELECT)
      .single();

    if (fallback.error) {
      throw fallback.error;
    }

    return normalizeProfile({
      ...fallback.data,
      first_name: values.first_name ?? null,
      last_name: values.last_name ?? null,
      gender: values.gender ?? null
    });
  }

  throw error;
}

function profileColumnsMissing(error) {
  return error?.code === COLUMN_NOT_FOUND;
}

export default async function adminRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);
  fastify.addHook('onRequest', fastify.authorize('admin'));

  fastify.get('/users', async (request, reply) => {
    try {
      const profiles = await listProfilesWithFallback(request.log);
      return profiles;
    } catch (error) {
      request.log.error(error, 'Error al listar usuarios');
      return reply.code(500).send({ message: 'No se pudieron obtener los usuarios' });
    }
  });

  fastify.post('/users', async (request, reply) => {
    const payload = parseWithSchema(createUserSchema, request.body ?? {});

    const firstName = payload.first_name?.trim() ?? null;
    const lastName = payload.last_name?.trim() ?? null;
    const fullNameFromParts = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
    const fullName = payload.full_name?.trim() ?? fullNameFromParts;

    const metadata = {
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      gender: payload.gender ?? null
    };

    const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: metadata
    });

    if (createError || !authUser?.user) {
      request.log.error(createError, 'Error al crear usuario Auth');
      return reply.code(400).send({ message: 'No se pudo crear el usuario. Verifica si el correo ya existe.' });
    }

    const profileData = {
      id: authUser.user.id,
      email: payload.email,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      gender: payload.gender ?? null,
      role: payload.role
    };

    try {
      const insertedProfile = await insertProfileWithFallback(profileData);
      return reply.code(201).send(insertedProfile);
    } catch (profileError) {
      request.log.error(profileError, 'Error al crear perfil asociado');
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return reply.code(500).send({ message: 'No se pudo crear el perfil del usuario' });
    }
  });

  fastify.patch('/users/:id/role', async (request, reply) => {
    const payload = parseWithSchema(updateRoleSchema, request.body ?? {});
    const updateResult = await updateProfileWithFallback(request.params.id, {
      role: payload.role,
      updated_at: new Date().toISOString()
    });

    if (updateResult.notFound) {
      return reply.code(404).send({ message: 'Usuario no encontrado' });
    }

    if (updateResult.error) {
      request.log.error(updateResult.error, 'Error al actualizar rol');
      return reply.code(500).send({ message: 'No se pudo actualizar el rol del usuario' });
    }

    return updateResult.data;
  });

  fastify.patch('/users/:id/state', async (request, reply) => {
    const payload = parseWithSchema(updateStateSchema, request.body ?? {});
    const { id } = request.params;
    const deletedAt = payload.active ? null : new Date().toISOString();

    const updateResult = await updateProfileWithFallback(id, {
      deleted_at: deletedAt,
      updated_at: new Date().toISOString()
    });

    if (updateResult.notFound) {
      return reply.code(404).send({ message: 'Usuario no encontrado' });
    }

    if (updateResult.error) {
      request.log.error(updateResult.error, 'Error al actualizar estado del usuario');
      return reply.code(500).send({ message: 'No se pudo actualizar el estado del usuario' });
    }

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      app_metadata: { disabled: !payload.active }
    });

    if (updateAuthError) {
      request.log.error(updateAuthError, 'Error al actualizar metadata Auth');
    }

    return { ...updateResult.data, active: payload.active };
  });

  fastify.patch('/users/:id/profile', async (request, reply) => {
    const payload = parseWithSchema(updateProfileSchema, request.body ?? {});
    const { id } = request.params;
    const trimmedFirst = payload.first_name.trim();
    const trimmedLast = payload.last_name.trim();
    const fullName = `${trimmedFirst} ${trimmedLast}`.replace(/\s+/g, ' ').trim();
    const updatedAt = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        first_name: trimmedFirst,
        last_name: trimmedLast,
        full_name: fullName,
        gender: payload.gender,
        updated_at: updatedAt
      })
      .eq('id', id)
      .select(EXTENDED_SELECT)
      .single();

    if (profileColumnsMissing(error)) {
      return reply
        .code(400)
        .send({
          message:
            'Debes ejecutar la migración que añade first_name, last_name y gender en la tabla profiles antes de editar estos campos.'
        });
    }

    if (error?.code === 'PGRST116') {
      return reply.code(404).send({ message: 'Usuario no encontrado' });
    }

    if (error) {
      request.log.error(error, 'Error al actualizar datos del usuario');
      return reply.code(500).send({ message: 'No se pudieron guardar los cambios del usuario' });
    }

    const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      user_metadata: {
        full_name: fullName,
        first_name: trimmedFirst,
        last_name: trimmedLast,
        gender: payload.gender
      }
    });

    if (metadataError) {
      request.log.error(metadataError, 'Error al actualizar metadata del usuario');
    }

    return normalizeProfile(data);
  });
}
