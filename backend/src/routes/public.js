import { z } from 'zod';
import { supabaseAdmin, findAuthUserByEmail } from '../lib/supabase.js';
import { config } from '../env.js';
import { parseWithSchema } from '../utils/validation.js';

const registerSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  first_name: z
    .string()
    .trim()
    .min(2, 'El nombre es obligatorio')
    .max(60, 'El nombre es demasiado largo'),
  last_name: z
    .string()
    .trim()
    .min(2, 'El apellido es obligatorio')
    .max(60, 'El apellido es demasiado largo'),
  gender: z.enum(['female', 'male'], {
    errorMap: () => ({ message: 'Selecciona un género válido' })
  })
});

const resendSchema = z.object({
  email: z.string().email('Correo inválido')
});

export default async function publicRoutes(fastify) {
  fastify.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));

  fastify.get('/me', { onRequest: [fastify.authenticate] }, async (request) => ({
    id: request.user.id,
    email: request.user.email,
    role: request.user.role,
    fullName: request.user.fullName,
    firstName: request.user.firstName,
    lastName: request.user.lastName,
    gender: request.user.gender
  }));

  fastify.post('/register', async (request, reply) => {
    const payload = parseWithSchema(registerSchema, request.body ?? {});
    const firstName = payload.first_name.trim();
    const lastName = payload.last_name.trim();
    const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();

    const redirectUrl = `${config.siteUrl}/#/login`;

    const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        data: {
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
          gender: payload.gender
        },
        emailRedirectTo: redirectUrl
      }
    });

    if (signUpError || !signUpData?.user) {
      if (signUpError?.status === 400 && /already registered/i.test(signUpError.message ?? '')) {
        return reply.code(409).send({ message: 'Este correo ya está registrado.' });
      }

      request.log.warn(signUpError, 'Error al registrar usuario público');
      return reply.code(400).send({ message: 'No se pudo crear la cuenta. ¿Ya registraste este correo?' });
    }

    const profileData = {
      id: signUpData.user.id,
      email: payload.email,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      gender: payload.gender,
      role: 'user'
    };

    const { error: profileError } = await supabaseAdmin.from('profiles').insert(profileData);

    if (profileError?.code === '23505') {
      request.log.info(profileError, 'Correo ya existe al crear perfil tras registro');
      await supabaseAdmin.auth.admin.deleteUser(signUpData.user.id);
      return reply.code(409).send({ message: 'Este correo ya está registrado. Intenta iniciar sesión o recuperar tu acceso.' });
    }

    if (profileError?.code === '42703') {
      const fallbackInsert = await supabaseAdmin
        .from('profiles')
        .insert({
          id: signUpData.user.id,
          email: payload.email,
          full_name: fullName,
          role: 'user'
        });

      if (fallbackInsert.error?.code === '23505') {
        request.log.info(fallbackInsert.error, 'Correo ya existe al crear perfil tras registro (fallback)');
        await supabaseAdmin.auth.admin.deleteUser(signUpData.user.id);
        return reply.code(409).send({ message: 'Este correo ya está registrado. Intenta iniciar sesión o recuperar tu acceso.' });
      }

      if (fallbackInsert.error) {
        request.log.error(fallbackInsert.error, 'Error al crear perfil tras registro (fallback)');
        await supabaseAdmin.auth.admin.deleteUser(signUpData.user.id);
        return reply.code(500).send({ message: 'No se pudo completar el registro. Intenta nuevamente más tarde.' });
      }
    } else if (profileError) {
      request.log.error(profileError, 'Error al crear perfil tras registro');
      await supabaseAdmin.auth.admin.deleteUser(signUpData.user.id);
      return reply.code(500).send({ message: 'No se pudo completar el registro. Intenta nuevamente más tarde.' });
    }

    const { error: confirmationError } = await supabaseAdmin.auth.resend({
      type: 'signup',
      email: payload.email,
      options: { emailRedirectTo: redirectUrl }
    });

    if (confirmationError && confirmationError.code !== 'over_email_send_rate_limit') {
      request.log.warn(confirmationError, 'No se pudo reenviar confirmación inmediatamente tras el registro');
    }

    return reply.code(201).send({
      message:
        'Te has registrado correctamente. Te llegará un mensaje de confirmación a tu correo para poder acceder. El mensaje puede tardar un par de minutos en llegar.'
    });
  });

  fastify.post('/register/resend', async (request, reply) => {
    const { email } = parseWithSchema(resendSchema, request.body ?? {});

    let existingUser = null;
    try {
      existingUser = await findAuthUserByEmail(email);
    } catch (lookupError) {
      request.log.error(lookupError, 'Error buscando usuario para reenviar confirmación');
      return reply.code(500).send({ message: 'No pudimos reenviar el correo. Inténtalo más tarde.' });
    }

    if (!existingUser) {
      return reply.code(200).send({ message: 'Si el correo existe, recibirás un nuevo enlace de verificación.' });
    }

    if (existingUser.email_confirmed_at) {
      return reply.code(200).send({ message: 'Este correo ya está confirmado. Intenta iniciar sesión.' });
    }

    const { error: resendError } = await supabaseAdmin.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${config.siteUrl}/#/login` }
    });

    if (resendError) {
      request.log.error(resendError, 'Error al reenviar correo de verificación');
      return reply.code(500).send({ message: 'No pudimos reenviar el correo. Inténtalo más tarde.' });
    }

    return reply.code(200).send({ message: 'Te enviamos un nuevo enlace de confirmación. Revisa tu bandeja o spam.' });
  });
}
