import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../services/apiClient.js';

const TYPE_COPY = {
  income: {
    title: 'Categoría para ingresos',
    description: 'Usa categorías para clasificar tus ingresos y analizarlos con mayor claridad.',
    returnPath: '/incomes'
  },
  expense: {
    title: 'Categoría para gastos',
    description: 'Agrupa tus gastos para entender mejor tus hábitos y presupuestos.',
    returnPath: '/expenses'
  }
};

function CreateCategoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get('type');
  const type = typeParam === 'expense' ? 'expense' : 'income';
  const returnTo = searchParams.get('returnTo') || TYPE_COPY[type].returnPath;
  const [error, setError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm({
    defaultValues: { name: '' }
  });

  const onSubmit = async (values) => {
    try {
      await apiFetch('/categories', {
        method: 'POST',
        body: {
          name: values.name,
          type
        }
      });
      navigate(returnTo, { replace: true });
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudo crear la categoría';
      setError(message);
    }
  };

  return (
    <section style={{ maxWidth: '560px', margin: '0 auto', padding: '2rem 1rem', display: 'grid', gap: '2rem' }}>
      <header style={{ display: 'grid', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => navigate(returnTo)}
          style={{ justifySelf: 'start', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', backgroundColor: '#fff', cursor: 'pointer' }}
        >
          ← Volver
        </button>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>{TYPE_COPY[type].title}</h2>
          <p style={{ margin: 0, color: '#6b7280' }}>{TYPE_COPY[type].description}</p>
        </div>
      </header>

      <form
        onSubmit={handleSubmit(onSubmit)}
        style={{ backgroundColor: '#fff', borderRadius: '1rem', padding: '2rem', boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)', display: 'grid', gap: '1.5rem' }}
      >
        <label style={{ display: 'grid', gap: '0.5rem' }}>
          <span>Nombre de la categoría</span>
          <input
            type="text"
            placeholder={type === 'income' ? 'Salario, freelance...' : 'Renta, alimentación...'}
            required
            {...register('name')}
            style={{ padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid #d1d5db' }}
          />
        </label>

        {error ? <p style={{ color: '#dc2626', margin: 0 }}>{error}</p> : null}

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', border: 'none', backgroundColor: '#10b981', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
          >
            {isSubmitting ? 'Guardando...' : 'Crear categoría'}
          </button>
          <button
            type="button"
            onClick={() => navigate(returnTo)}
            style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', border: '1px solid #d1d5db', backgroundColor: '#fff', fontWeight: 600, cursor: 'pointer' }}
          >
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

export default CreateCategoryPage;
