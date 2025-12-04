import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiFetch } from '../services/apiClient.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import './ExpensesPage.css';

const formatAmount = (value) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const monthFormatter = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric'
});

const formatDate = (value) => {
  if (!value) return '';
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(value);
  if (!match) {
    return new Date(value).toLocaleDateString('es-NI');
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString('es-NI');
};

const formatMonthLabel = (value) => {
  if (!value) return '';
  const [year, month] = value.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  const label = monthFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const EXCHANGE_RATE = 36.7;
const SOURCE_OPTIONS = [
  { value: 'bank', label: 'Cuenta bancaria' },
  { value: 'cash', label: 'Efectivo' }
];

const SOURCE_LABELS = SOURCE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

function ExpensesPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', category_id: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('list');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthsOverview, setMonthsOverview] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [categoryDraftName, setCategoryDraftName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState(null);
  const [showCategoryDeleteConfirm, setShowCategoryDeleteConfirm] = useState(false);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const initialFetchDoneRef = useRef(false);

  const refreshCategories = useCallback(async () => {
    try {
      const response = await apiFetch('/categories?type=expense');
      setCategories(response ?? []);
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudieron cargar las categorías';
      setError(message);
    }
  }, []);

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

  const loadExpenses = useCallback(async (query = {}) => {
    setLoading(true);
    try {
      const search = new URLSearchParams();
      if (query.from) search.set('from', query.from);
      if (query.to) search.set('to', query.to);
      if (query.category_id) search.set('category_id', query.category_id);

      const queryString = search.toString();
      const [expensesResponse, categoriesResponse] = await Promise.all([
        apiFetch(`/expenses${queryString ? `?${queryString}` : ''}`),
        apiFetch('/categories?type=expense')
      ]);

      setItems(expensesResponse ?? []);
      setCategories(categoriesResponse ?? []);
      setError(null);
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudieron cargar los gastos';
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
    void loadExpenses(filters);
  }, [filters, loadExpenses]);

  const onSubmitExpense = async (values) => {
    try {
      await apiFetch('/expenses', {
        method: 'POST',
        body: {
          amount: Number(values.amount),
          currency: values.currency,
          source: values.source,
          date: values.date,
          category_id: values.category_id || null,
          note: values.note || null
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
      await loadExpenses(filters);
      setActiveTab('list');
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudo registrar el gasto';
      setError(message);
    }
  };

  const requestDeleteExpense = useCallback((item) => {
    setDeleteTarget(item);
    setShowDeleteConfirm(true);
  }, []);

  const handleCancelDelete = useCallback(() => {
    if (isDeleting) {
      return;
    }
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  }, [isDeleting]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    setIsDeleting(true);
    try {
      await apiFetch(`/expenses/${deleteTarget.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudo eliminar el gasto';
      setError(message);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget]);

  const handleStartEditCategory = useCallback((category) => {
    setEditingCategoryId(category.id);
    setCategoryDraftName(category.name ?? '');
  }, []);

  const handleCancelEditCategory = useCallback(() => {
    if (savingCategory) {
      return;
    }
    setEditingCategoryId(null);
    setCategoryDraftName('');
  }, [savingCategory]);

  const handleSaveCategory = useCallback(async () => {
    if (!editingCategoryId) {
      return;
    }
    const trimmed = categoryDraftName.trim();
    if (trimmed.length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    setSavingCategory(true);
    try {
      await apiFetch(`/categories/${editingCategoryId}`, {
        method: 'PUT',
        body: { name: trimmed, type: 'expense' }
      });
      setCategories((prev) => prev.map((category) => (category.id === editingCategoryId ? { ...category, name: trimmed } : category)));
      setItems((prev) =>
        prev.map((item) =>
          item.category_id === editingCategoryId ? { ...item, category_name: trimmed } : item
        )
      );
      setEditingCategoryId(null);
      setCategoryDraftName('');
      setError(null);
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudo actualizar la categoría';
      setError(message);
    } finally {
      setSavingCategory(false);
    }
  }, [categoryDraftName, editingCategoryId]);

  const requestDeleteCategory = useCallback((category) => {
    setCategoryDeleteTarget(category);
    setShowCategoryDeleteConfirm(true);
  }, []);

  const handleCancelDeleteCategory = useCallback(() => {
    if (isDeletingCategory) {
      return;
    }
    setShowCategoryDeleteConfirm(false);
    setCategoryDeleteTarget(null);
  }, [isDeletingCategory]);

  const handleConfirmDeleteCategory = useCallback(async () => {
    if (!categoryDeleteTarget) {
      return;
    }
    setIsDeletingCategory(true);
    try {
      await apiFetch(`/categories/${categoryDeleteTarget.id}`, { method: 'DELETE' });
      setCategories((prev) => prev.filter((category) => category.id !== categoryDeleteTarget.id));
      setItems((prev) =>
        prev.map((item) =>
          item.category_id === categoryDeleteTarget.id ? { ...item, category_id: null, category_name: null } : item
        )
      );
      setShowCategoryDeleteConfirm(false);
      setCategoryDeleteTarget(null);
      setError(null);
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudo eliminar la categoría';
      setError(message);
    } finally {
      setIsDeletingCategory(false);
    }
  }, [categoryDeleteTarget]);

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

  const handleFilterInputChange = useCallback((event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    if (name === 'from' || name === 'to') {
      setSelectedMonth(null);
    }
  }, []);

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
      void loadExpenses(nextFilters);
    },
    [filters.category_id, loadExpenses]
  );

  return (
    <section className="expenses">
      <header className="expenses__header">
        <div className="expenses__heading">
          <h1>Gastos</h1>
          <p>Controla tus egresos diarios y clasifícalos fácilmente.</p>
          <nav className="expenses__tabs expenses__actions">
            {[
              { id: 'list', label: 'Lista de gastos', icon: '📋' },
              { id: 'add', label: 'Agregar gasto', icon: '➖' },
              { id: 'category', label: 'Agregar categoría', icon: '🗂️' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`expenses__tab ${activeTab === tab.id ? 'expenses__tab--active' : ''}`}
              >
                <span aria-hidden>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="expenses__summary">
          <span className="expenses__summary-label">Total estimado</span>
          <strong className="expenses__summary-value expenses__summary-value--nio">
            C${totals.nio.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
          <strong className="expenses__summary-value">
            ${totals.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </strong>
          <span className="expenses__summary-detail">
            Cuenta bancaria: C${totals.bank.nio.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${totals.bank.usd.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })} USD
          </span>
          <span className="expenses__summary-detail">
            Efectivo: C${totals.cash.nio.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${totals.cash.usd.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })} USD
          </span>
        </div>
      </header>

      {error ? <p className="expenses__error">{error}</p> : null}

      {activeTab === 'list' ? (
        <article className="expenses-card">
          <header className="expenses-card__header">
            <div className="expenses-card__heading">
              <h2>
                <span role="img" aria-hidden>
                  💳
                </span>
                Lista de gastos
              </h2>
              <p>Visualiza tus egresos y verifica el estado de tus categorías.</p>
            </div>
          </header>

          <section className={`expenses-monthly${monthsOverview.length > 0 ? ' expenses-monthly--with-summary' : ''}`}>
            <div className="expenses-monthly__info">
              {monthsOverview.length > 0 ? (
                <>
                  <h3>Totales por mes</h3>
                  <p>Controla cuánto gastas cada mes y cuántos movimientos registraste.</p>
                </>
              ) : null}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setSelectedMonth(null);
                  void loadExpenses({ ...filters });
                }}
                className="expenses-filters"
              >
                <label className="expenses-field">
                  <span>Desde</span>
                  <input name="from" type="date" value={filters.from} onChange={handleFilterInputChange} className="expenses-input" />
                </label>
                <label className="expenses-field">
                  <span>Hasta</span>
                  <input name="to" type="date" value={filters.to} onChange={handleFilterInputChange} className="expenses-input" />
                </label>
                <label className="expenses-field">
                  <span>Categoría</span>
                  <select name="category_id" value={filters.category_id} onChange={handleFilterInputChange} className="expenses-input">
                    <option value="">Todas</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="expenses-button">
                  Aplicar filtros
                </button>
              </form>
            </div>
            {monthsOverview.length > 0 ? (
              <div className="expenses-monthly__aside">
                <label className="expenses-monthly__picker">
                  <span>Mes y año</span>
                  <select
                    className="expenses-monthly__select"
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
                  <article className="expenses-monthly__card expenses-monthly__card--focus">
                    <div className="expenses-monthly__card-header">
                      <h4>{selectedMonthData.label}</h4>
                      <span className="expenses-monthly__hint">
                        {selectedMonthData.count} {selectedMonthData.count === 1 ? 'movimiento' : 'movimientos'}
                      </span>
                    </div>
                    <p className="expenses-monthly__value expenses-monthly__value--nio">
                      <span>NIO</span>
                      <strong>C${formatAmount(selectedMonthData.nio)}</strong>
                    </p>
                    <p className="expenses-monthly__value">
                      <span>USD</span>
                      <strong>${formatAmount(selectedMonthData.usd)}</strong>
                    </p>
                  </article>
                ) : (
                  <p className="expenses-card__placeholder expenses-monthly__placeholder">Selecciona un mes para ver el detalle.</p>
                )}
              </div>
            ) : null}
          </section>

          {loading ? (
            <p className="expenses-card__placeholder">Cargando gastos...</p>
          ) : items.length === 0 ? (
            <p className="expenses-card__placeholder">No hay gastos registrados con los filtros actuales.</p>
          ) : (
            <div className="expenses-table__wrapper">
              <table className="expenses-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Origen</th>
                    <th>Categoría</th>
                    <th>Nota</th>
                    <th className="expenses-table__actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.date)}</td>
                      <td className="expenses-table__amount">
                        {item.currency === 'NIO' ? 'C$' : '$'}
                        {Number(item.amount).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td>{SOURCE_LABELS[item.source ?? 'cash']}</td>
                      <td>{item.category_name ?? 'Sin categoría'}</td>
                      <td className="expenses-table__note">{item.note ?? '-'}</td>
                      <td className="expenses-table__actions">
                        <button onClick={() => requestDeleteExpense(item)} className="expenses-table__delete">
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
        <form onSubmit={handleSubmit(onSubmitExpense)} className="expenses-card expenses-form">
          <div className="expenses-form__intro">
            <h2>Registrar gasto</h2>
            <p>Incluye gastos operativos, pagos recurrentes y compras puntuales.</p>
          </div>
          <label className="expenses-field">
            <span>Monto</span>
            <input type="number" step="0.01" placeholder="0.00" required {...register('amount')} className="expenses-input" />
          </label>
          <label className="expenses-field">
            <span>Moneda</span>
            <select {...register('currency')} className="expenses-select">
              <option value="NIO">Córdoba nicaragüense (C$)</option>
              <option value="USD">Dólar estadounidense ($)</option>
            </select>
          </label>
          <label className="expenses-field">
            <span>Origen del gasto</span>
            <select {...register('source')} className="expenses-select">
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="expenses-field">
            <span>Fecha</span>
            <input type="date" required {...register('date')} className="expenses-input" />
          </label>
          <label className="expenses-field">
            <span>Categoría</span>
            <select {...register('category_id')} className="expenses-select">
              <option value="">Sin categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="expenses-field expenses-field--full">
            <span>Nota</span>
            <textarea rows={3} placeholder="Describe el gasto" {...register('note')} className="expenses-textarea" />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`expenses-button expenses-button--primary ${isSubmitting ? 'is-disabled' : ''}`}
          >
            {isSubmitting ? 'Guardando...' : 'Guardar gasto'}
          </button>
        </form>
      ) : null}

      {activeTab === 'category' ? (
        <section className="expenses-card expenses-category">
          <div className="expenses-category__intro">
            <h2>Nueva categoría de gasto</h2>
            <p>Clasifica tus egresos para obtener reportes más claros.</p>
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const formData = new FormData(formElement);
              const name = `${formData.get('name') ?? ''}`.trim();
              if (!name) {
                return;
              }
              try {
                setCreatingCategory(true);
                const created = await apiFetch('/categories', {
                  method: 'POST',
                  body: { name, type: 'expense' }
                });
                formElement.reset();
                if (created) {
                  setCategories((prev) => [created, ...prev.filter((category) => category.id !== created.id)]);
                } else {
                  await refreshCategories();
                }
                setError(null);
              } catch (err) {
                console.error(err);
                const message = err.payload?.message ?? err.message ?? 'No se pudo crear la categoría';
                setError(message);
              } finally {
                setCreatingCategory(false);
              }
            }}
            className="expenses-category__form"
          >
            <label className="expenses-field expenses-category__field">
              <span>Nombre</span>
              <input name="name" type="text" placeholder="Servicios, suministros, renta..." required className="expenses-input" />
            </label>
            <button
              type="submit"
              disabled={creatingCategory}
              className={`expenses-button expenses-button--primary ${creatingCategory ? 'is-disabled' : ''}`}
            >
              {creatingCategory ? 'Creando...' : 'Crear categoría'}
            </button>
          </form>

          <div className="expenses-category__list">
            <div className="expenses-category__list-header">
              <h3>Mis categorías</h3>
              <p>Administra la lista que usas al registrar tus gastos.</p>
            </div>
            {categories.length === 0 ? (
              <p className="expenses-category__empty">Aún no tienes categorías registradas. Crea una para comenzar.</p>
            ) : (
              <ul className="expenses-category__items">
                {categories.map((category) => (
                  <li key={category.id} className="expenses-category__item">
                    {editingCategoryId === category.id ? (
                      <>
                        <input
                          type="text"
                          value={categoryDraftName}
                          onChange={(event) => setCategoryDraftName(event.target.value)}
                          className="expenses-input expenses-category__input"
                          autoFocus
                        />
                        <div className="expenses-category__actions">
                          <button
                            type="button"
                            className="expenses-category__button expenses-category__button--primary"
                            onClick={handleSaveCategory}
                            disabled={savingCategory}
                          >
                            {savingCategory ? 'Guardando…' : 'Guardar'}
                          </button>
                          <button
                            type="button"
                            className="expenses-category__button"
                            onClick={handleCancelEditCategory}
                            disabled={savingCategory}
                          >
                            Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="expenses-category__name">{category.name}</span>
                        <div className="expenses-category__actions">
                          <button
                            type="button"
                            className="expenses-category__button"
                            onClick={() => handleStartEditCategory(category)}
                            disabled={savingCategory || isDeletingCategory}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="expenses-category__button expenses-category__button--danger"
                            onClick={() => requestDeleteCategory(category)}
                            disabled={savingCategory || isDeletingCategory}
                          >
                            Eliminar
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Eliminar gasto"
        message={deleteTarget ? `Eliminarás el gasto del ${formatDate(deleteTarget.date)} por ${deleteTarget.currency === 'NIO' ? 'C$' : '$'}${Number(deleteTarget.amount ?? 0).toLocaleString('es-NI', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}. Esta acción no se puede deshacer.` : 'Esta acción no se puede deshacer.'}
        confirmLabel={isDeleting ? 'Eliminando…' : 'Eliminar'}
        cancelLabel="Cancelar"
        confirmDisabled={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <ConfirmDialog
        open={showCategoryDeleteConfirm}
        title="Eliminar categoría"
        message={categoryDeleteTarget ? `¿Deseas eliminar la categoría “${categoryDeleteTarget.name}”? Los gastos asociados conservarán el movimiento pero quedarán sin categoría.` : 'Esta acción no se puede deshacer.'}
        confirmLabel={isDeletingCategory ? 'Eliminando…' : 'Eliminar'}
        cancelLabel="Cancelar"
        confirmDisabled={isDeletingCategory}
        onConfirm={handleConfirmDeleteCategory}
        onCancel={handleCancelDeleteCategory}
      />
    </section>
  );
}

export default ExpensesPage;
