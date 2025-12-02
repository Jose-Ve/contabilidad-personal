import fp from 'fastify-plugin';
import { supabaseAdmin, ensureProfileExists } from '../lib/supabase.js';

function buildUnauthorized(reply, message = 'No autorizado') {
  return reply.code(401).send({ message });
}

export default fp(async function authPlugin(fastify) {
  fastify.decorate('authenticate', async function authenticate(request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return buildUnauthorized(reply, 'Falta encabezado Authorization');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return buildUnauthorized(reply, 'Formato de token inválido');
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      fastify.log.warn({ error }, 'Token inválido');
      return buildUnauthorized(reply, 'Sesión inválida');
    }

    const user = data.user;
    const profile = await ensureProfileExists({ id: user.id, email: user.email });

    if (profile?.deleted_at) {
      return reply.code(403).send({ message: 'Cuenta desactivada. Contacta al administrador.' });
    }

    const metadata = user.user_metadata ?? {};

    request.user = {
      id: user.id,
      email: user.email,
      role: profile?.role ?? 'user',
      fullName: profile?.full_name ?? metadata.full_name ?? null,
      firstName: profile?.first_name ?? metadata.first_name ?? null,
      lastName: profile?.last_name ?? metadata.last_name ?? null,
      gender: profile?.gender ?? metadata.gender ?? null
    };
  });

  fastify.decorate('authorize', function authorize(requiredRole) {
    return async function authorizationHook(request, reply) {
      const { user } = request;
      if (!user) {
        return buildUnauthorized(reply);
      }

      if (requiredRole === 'admin' && user.role !== 'admin') {
        return reply.code(403).send({ message: 'Se requieren privilegios de administrador.' });
      }
    };
  });
});
