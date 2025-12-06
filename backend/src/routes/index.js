import authRoutes from './public.js';
import incomesRoutes from './incomes.js';
import expensesRoutes from './expenses.js';
import balanceRoutes from './balance.js';
import categoriesRoutes from './categories.js';
import adminRoutes from './admin.js';
import transfersRoutes from './transfers.js';
import accountsRoutes from './accounts.js';

export default async function registerRoutes(fastify) {
  await fastify.register(authRoutes);
  await fastify.register(categoriesRoutes, { prefix: '/categories' });
  await fastify.register(accountsRoutes, { prefix: '/accounts' });
  await fastify.register(incomesRoutes, { prefix: '/incomes' });
  await fastify.register(expensesRoutes, { prefix: '/expenses' });
  await fastify.register(balanceRoutes, { prefix: '/balance' });
  await fastify.register(adminRoutes, { prefix: '/admin' });
  await fastify.register(transfersRoutes, { prefix: '/transfers' });
}
