import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '../services/apiClient.js';
import './IncomesPage.css';

const formatAmount = (value) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const monthFormatter = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric'
});

const formatMonthLabel = (value) => {
  if (!value) return '';
  const [year, month] = value.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  const label = monthFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const EXCHANGE_RATE = 36.7; // 1 USD equivale a 36.70 C$
const SOURCE_OPTIONS = [
  { value: 'bank', label: 'Cuenta bancaria' },
  { value: 'cash', label: 'Efectivo' }
];

const SOURCE_LABELS = SOURCE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

function IncomesPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ from: '', to: '', category_id: '' });
  const [activeTab, setActiveTab] = useState('list');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthsOverview, setMonthsOverview] = useState([]);
  const initialFetchDoneRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm({
    defaultValues: {
      amount: '',
      currency: 'NIO',
      source: 'bank',
      date: new Date().toISOString().slice(0, 10),
      category_id: '',
      note: ''
    }
  });

  const loadIncomes = useCallback(async (query = {}) => {
    setLoading(true);
    try {
      const search = new URLSearchParams();
      if (query.from) search.set('from', query.from);
      if (query.to) search.set('to', query.to);
      if (query.category_id) search.set('category_id', query.category_id);

      const [incomesResponse, categoriesResponse] = await Promise.all([
        apiFetch(`/incomes${search.toString() ? `?${search.toString()}` : ''}`),
        apiFetch('/categories?type=income')
      ]);

      setItems(incomesResponse ?? []);
      setCategories(categoriesResponse ?? []);
      setError(null);
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudieron cargar los ingresos';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialFetchDoneRef.current) {
      return;
    }

    initialFetchDoneRef.current = true;
    void loadIncomes(filters);
  }, [filters, loadIncomes]);

  const onSubmitIncome = async (values) => {
    try {
      await apiFetch('/incomes', {
        method: 'POST',
        body: {
          amount: Number(values.amount),
          currency: values.currency,
          source: values.source,
          date: values.date,
          category_id: values.category_id || null,
          note: values.note ?? null
        }
      });
      reset({
        amount: '',
        currency: values.currency,
        source: values.source,
        date: values.date,
        category_id: values.category_id,
        note: ''
      });
      await loadIncomes(filters);
      setActiveTab('list');
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudo registrar el ingreso';
      setError(message);
    }
  };

  const onDeleteIncome = async (id) => {
    if (!window.confirm('¿Eliminar este ingreso?')) return;
    try {
      await apiFetch(`/incomes/${id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudo eliminar el ingreso';
      setError(message);
    }
  };

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const amount = Number(item.amount ?? 0);
        const isNio = item.currency === 'NIO';
        const usdValue = isNio ? amount / EXCHANGE_RATE : amount;
        const nioValue = isNio ? amount : amount * EXCHANGE_RATE;

        acc.usd += usdValue;
        acc.nio += nioValue;

        const bucketKey = item.source === 'bank' ? 'bank' : 'cash';
        acc[bucketKey].usd += usdValue;
        acc[bucketKey].nio += nioValue;

        return acc;
      },
      {
        usd: 0,
        nio: 0,
        bank: { usd: 0, nio: 0 },
        cash: { usd: 0, nio: 0 }
      }
    );
  }, [items]);

  const monthlySummary = useMemo(() => {
    if (!items.length) return [];

    const buckets = new Map();

    for (const item of items) {
      if (!item?.date) continue;
      const monthKey = item.date.slice(0, 7);
      if (!buckets.has(monthKey)) {
        buckets.set(monthKey, { usd: 0, nio: 0, count: 0 });
      }
      const bucket = buckets.get(monthKey);
      const amount = Number(item.amount ?? 0);
      const isNio = item.currency === 'NIO';
      const usdValue = isNio ? amount / EXCHANGE_RATE : amount;
      const nioValue = isNio ? amount : amount * EXCHANGE_RATE;

      bucket.usd += usdValue;
      bucket.nio += nioValue;
      bucket.count += 1;
    }

    return Array.from(buckets.entries())
      .map(([month, values]) => ({
        month,
        label: formatMonthLabel(month),
        usd: values.usd,
        nio: values.nio,
        count: values.count
      }))
      .sort((a, b) => (a.month < b.month ? 1 : -1));
  }, [items]);

  useEffect(() => {
    if (!filters.from && !filters.to && !filters.category_id) {
      setMonthsOverview(monthlySummary);
    }
  }, [monthlySummary, filters]);

  useEffect(() => {
    if (!monthsOverview.length) {
      setSelectedMonth(null);
      return;
    }

    setSelectedMonth((prev) => {
      if (prev && monthsOverview.some((entry) => entry.month === prev)) {
        return prev;
      }
      return monthsOverview[0].month;
    });
  }, [monthsOverview]);

  const selectedMonthData = useMemo(() => {
    if (!selectedMonth) {
      return null;
    }
    return monthsOverview.find((entry) => entry.month === selectedMonth) ?? null;
  }, [monthsOverview, selectedMonth]);

  const monthOptions = useMemo(
    () =>
      monthsOverview.map((entry) => ({
        value: entry.month,
        label: `${entry.label} · ${entry.count} ${entry.count === 1 ? 'mov.' : 'movs.'}`
      })),
    [monthsOverview]
  );

  const handleFilterInputChange = useCallback(
    (event) => {
      const { name, value } = event.target;
      setFilters((prev) => ({ ...prev, [name]: value }));
      if (name === 'from' || name === 'to') {
        setSelectedMonth(null);
      }
    },
    [setFilters, setSelectedMonth]
  );

  const getMonthBounds = (monthKey) => {
    const [year, month] = monthKey.split('-');
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 0);
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    return { from, to };
  };

  const handleMonthSelect = useCallback(
    (monthKey) => {
      const bounds = getMonthBounds(monthKey);
      const nextFilters = {
        from: bounds.from,
        to: bounds.to,
        category_id: filters.category_id
      };
      setSelectedMonth(monthKey);
      setFilters(nextFilters);
      void loadIncomes(nextFilters);
    },
    [filters.category_id, loadIncomes, setFilters]
  );

  return (
    <section className="incomes">
      <header className="incomes__header">
        <div className="incomes__heading">
          <h1>Ingresos</h1>
          <p>Consulta, registra y organiza tus ingresos.</p>
          <nav className="incomes__tabs incomes__actions">
            {[
              { id: 'list', label: 'Lista de ingresos', icon: '📋' },
              { id: 'add', label: 'Agregar ingreso', icon: '➕' },
              { id: 'category', label: 'Agregar categoría', icon: '🗂️' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`incomes__tab ${activeTab === tab.id ? 'incomes__tab--active' : ''}`}
              >
                <span aria-hidden>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="incomes__summary">
          <span className="incomes__summary-label">Total estimado</span>
          <strong className="incomes__summary-value incomes__summary-value--nio">
            C${totals.nio.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
          <strong className="incomes__summary-value">
            ${totals.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </strong>
          <span className="incomes__summary-detail">
            Cuenta bancaria: C${totals.bank.nio.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${totals.bank.usd.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })} USD
          </span>
          <span className="incomes__summary-detail">
            Efectivo: C${totals.cash.nio.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${totals.cash.usd.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })} USD
          </span>
        </div>
      </header>

      {error ? <p className="incomes__error">{error}</p> : null}

      {activeTab === 'list' ? (
        <article className="incomes-card">
          <header className="incomes-card__header">
            <div className="incomes-card__heading">
              <h2>
                <span role="img" aria-hidden>
                  📑
                </span>
                Lista de ingresos
              </h2>
              <p>Filtra por fechas o categorías para encontrar movimientos específicos.</p>
            </div>
          </header>

          <section className={`incomes-monthly${monthsOverview.length > 0 ? ' incomes-monthly--with-summary' : ''}`}>
            <div className="incomes-monthly__info">
              {monthsOverview.length > 0 ? (
                <>
                  <h3>Totales por mes</h3>
                  <p>Consulta cómo evolucionan tus ingresos y cuántos movimientos registraste cada mes.</p>
                </>
              ) : null}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setSelectedMonth(null);
                  void loadIncomes({ ...filters });
                }}
                className="incomes-filters"
              >
                <label className="incomes-field">
                  <span>Desde</span>
                  <input name="from" type="date" value={filters.from} onChange={handleFilterInputChange} className="incomes-input" />
                </label>
                <label className="incomes-field">
                  <span>Hasta</span>
                  <input name="to" type="date" value={filters.to} onChange={handleFilterInputChange} className="incomes-input" />
                </label>
                <label className="incomes-field">
                  <span>Categoría</span>
                  <select name="category_id" value={filters.category_id} onChange={handleFilterInputChange} className="incomes-input">
                    <option value="">Todas</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="incomes-button">
                  Aplicar filtros
                </button>
              </form>
            </div>
            {monthsOverview.length > 0 ? (
              <div className="incomes-monthly__aside">
                <label className="incomes-monthly__picker">
                  <span>Mes y año</span>
                  <select
                    className="incomes-monthly__select"
                    value={selectedMonth ?? ''}
                    onChange={(event) => {
                      const { value } = event.target;
                      if (value) {
                        handleMonthSelect(value);
                      }
                    }}
                  >
                    {monthOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedMonthData ? (
                  <article className="incomes-monthly__card incomes-monthly__card--focus">
                    <div className="incomes-monthly__card-header">
                      <h4>{selectedMonthData.label}</h4>
                      <span className="incomes-monthly__hint">
                        {selectedMonthData.count} {selectedMonthData.count === 1 ? 'movimiento' : 'movimientos'}
                      </span>
                    </div>
                    <p className="incomes-monthly__value incomes-monthly__value--nio">
                      <span>NIO</span>
                      <strong>C${formatAmount(selectedMonthData.nio)}</strong>
                    </p>
                    <p className="incomes-monthly__value">
                      <span>USD</span>
                      <strong>${formatAmount(selectedMonthData.usd)}</strong>
                    </p>
                  </article>
                ) : (
                  <p className="incomes-card__placeholder incomes-monthly__placeholder">Selecciona un mes para ver el resumen.</p>
                )}
              </div>
            ) : null}
          </section>

          {loading ? (
            <p className="incomes-card__placeholder">Cargando ingresos...</p>
          ) : items.length === 0 ? (
            <p className="incomes-card__placeholder">No hay ingresos registrados con los filtros actuales.</p>
          ) : (
            <div className="incomes-table__wrapper">
              <table className="incomes-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Origen</th>
                    <th>Categoría</th>
                    <th>Nota</th>
                    <th className="incomes-table__actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.date).toLocaleDateString()}</td>
                      <td className="incomes-table__amount">
                        {item.currency === 'NIO' ? 'C$' : '$'}
                        {Number(item.amount).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td>{SOURCE_LABELS[item.source ?? 'cash']}</td>
                      <td>{item.category_name ?? 'Sin categoría'}</td>
                      <td className="incomes-table__note">{item.note ?? '-'}</td>
                      <td className="incomes-table__actions">
                        <button onClick={() => onDeleteIncome(item.id)} className="incomes-table__delete">
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      ) : null}

      {activeTab === 'add' ? (
        <form onSubmit={handleSubmit(onSubmitIncome)} className="incomes-card incomes-form">
          <div className="incomes-form__intro">
            <h2>Registrar ingreso</h2>
            <p>Completa el formulario para registrar un nuevo movimiento.</p>
          </div>
          <label className="incomes-field">
            <span>Monto</span>
            <input type="number" step="0.01" placeholder="0.00" required {...register('amount')} className="incomes-input" />
          </label>
          <label className="incomes-field">
            <span>Moneda</span>
            <select {...register('currency')} className="incomes-input">
              <option value="NIO">Córdoba nicaragüense (C$)</option>
              <option value="USD">Dólar estadounidense ($)</option>
            </select>
          </label>
          <label className="incomes-field">
            <span>Origen del ingreso</span>
            <select {...register('source')} className="incomes-input">
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="incomes-field">
            <span>Fecha</span>
            <input type="date" required {...register('date')} className="incomes-input" />
          </label>
          <label className="incomes-field">
            <span>Categoría</span>
            <select {...register('category_id')} className="incomes-input">
              <option value="">Sin categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="incomes-field incomes-field--full">
            <span>Nota</span>
            <textarea rows={3} placeholder="Detalles opcionales" {...register('note')} className="incomes-textarea" />
          </label>
          <button type="submit" disabled={isSubmitting} className="incomes-button incomes-button--primary">
            {isSubmitting ? 'Guardando...' : 'Guardar ingreso'}
          </button>
        </form>
      ) : null}

      {activeTab === 'category' ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const formElement = event.currentTarget;
            const formData = new FormData(formElement);
            const name = formData.get('name');
            if (!name) return;
            try {
              setCreatingCategory(true);
              await apiFetch('/categories', {
                method: 'POST',
                body: { name, type: 'income' }
              });
              formElement.reset();
              await loadIncomes(filters);
              setActiveTab('list');
              setError(null);
            } catch (err) {
              console.error(err);
              const message = err.payload?.message ?? err.message ?? 'No se pudo crear la categoría';
              setError(message);
            } finally {
              setCreatingCategory(false);
            }
          }}
          className="incomes-card incomes-category"
        >
          <div>
            <h2>Nueva categoría de ingreso</h2>
            <p>Agrupa tus movimientos con categorías creadas a medida.</p>
          </div>
          <label className="incomes-field">
            <span>Nombre</span>
            <input name="name" type="text" placeholder="Salarios, ventas, freelance..." required className="incomes-input" />
          </label>
          <button
            type="submit"
            disabled={creatingCategory}
            className={`incomes-button incomes-button--primary ${creatingCategory ? 'is-disabled' : ''}`}
          >
            {creatingCategory ? 'Creando...' : 'Crear categoría'}
          </button>
        </form>
      ) : null}
    </section>
  );
}

export default IncomesPage;
