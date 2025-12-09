import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { apiFetch } from '../services/apiClient.js';
import AccountSelector from '../components/AccountSelector.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { formatAccountName } from '../utils/accounts.js';
import './TransfersPage.css';

const TYPE_LABELS = {
  bank: 'Cuenta bancaria',
  cash: 'Efectivo'
};

const CURRENCY_OPTIONS = [
  { value: 'NIO', label: 'Córdobas (NIO)' },
  { value: 'USD', label: 'Dólares (USD)' }
];

const formatAmount = (value) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
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

const getLocalDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function describeLocation(type, account) {
  if (type === 'cash') {
    return TYPE_LABELS.cash;
  }

  if (account) {
    return formatAccountName(account);
  }

  return TYPE_LABELS.bank;
}

function TransfersPage() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('list');
  const [sourceAccount, setSourceAccount] = useState(null);
  const [destinationAccount, setDestinationAccount] = useState(null);
  const [editingTransfer, setEditingTransfer] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const buildDefaultValues = useCallback(
    () => ({
      amount: '',
      currency: 'NIO',
      date: getLocalDateInputValue(),
      source_type: 'cash',
      source_account_id: '',
      destination_type: 'bank',
      destination_account_id: '',
      note: ''
    }),
    []
  );

  const form = useForm({
    defaultValues: buildDefaultValues()
  });

  const {
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting }
  } = form;

  const sourceType = watch('source_type');
  const destinationType = watch('destination_type');
  const sourceAccountId = watch('source_account_id');
  const destinationAccountId = watch('destination_account_id');
  const currencyValue = watch('currency');

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/transfers');
      setTransfers(response ?? []);
      setError(null);
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudieron cargar las transferencias';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransfers();
  }, [loadTransfers]);

  const forcedCurrency = useMemo(() => {
    return sourceAccount?.currency ?? destinationAccount?.currency ?? null;
  }, [sourceAccount, destinationAccount]);

  useEffect(() => {
    if (!forcedCurrency) {
      if (!currencyValue) {
        setValue('currency', 'NIO', { shouldDirty: false, shouldValidate: true });
      }
      return;
    }

    setValue('currency', forcedCurrency, { shouldDirty: true, shouldValidate: true });
  }, [forcedCurrency, currencyValue, setValue]);

  const handleSourceAccountChange = useCallback(
    ({ source, account }) => {
      if (source === 'bank' && account) {
        setSourceAccount(account);
      } else {
        setSourceAccount(null);
      }
    },
    []
  );

  const handleDestinationAccountChange = useCallback(
    ({ source, account }) => {
      if (source === 'bank' && account) {
        setDestinationAccount(account);
      } else {
        setDestinationAccount(null);
      }
    },
    []
  );

  useEffect(() => {
    if (sourceType !== 'bank') {
      setSourceAccount(null);
    }
  }, [sourceType]);

  useEffect(() => {
    if (destinationType !== 'bank') {
      setDestinationAccount(null);
    }
  }, [destinationType]);

  const currencyMismatch = useMemo(() => {
    if (!sourceAccount || !destinationAccount) {
      return false;
    }
    return sourceAccount.currency !== destinationAccount.currency;
  }, [sourceAccount, destinationAccount]);

  const sameAccountSelected = useMemo(() => {
    if (sourceType !== 'bank' || destinationType !== 'bank') {
      return false;
    }
    if (!sourceAccountId || !destinationAccountId) {
      return false;
    }
    return sourceAccountId === destinationAccountId;
  }, [sourceAccountId, destinationAccountId, sourceType, destinationType]);

  useEffect(() => {
    if (!currencyMismatch && error === 'Las cuentas seleccionadas deben manejar la misma moneda.') {
      setError(null);
    }
  }, [currencyMismatch, error]);

  useEffect(() => {
    if (!sameAccountSelected && error === 'Selecciona cuentas diferentes para origen y destino.') {
      setError(null);
    }
  }, [sameAccountSelected, error]);

  const totalsByCurrency = useMemo(() => {
    return transfers.reduce((acc, transfer) => {
      const currency = transfer.currency ?? 'NIO';
      acc[currency] = (acc[currency] ?? 0) + Number(transfer.amount ?? 0);
      return acc;
    }, {});
  }, [transfers]);

  const handleStartEdit = useCallback(
    (transfer) => {
      setActiveTab('create');
      setEditingTransfer(transfer);
      reset({
        amount: transfer.amount !== undefined ? String(transfer.amount) : '',
        currency: transfer.currency ?? 'NIO',
        date: transfer.date ?? getLocalDateInputValue(),
        source_type: transfer.source_type ?? 'cash',
        source_account_id:
          transfer.source_type === 'bank' ? transfer.source_account_id ?? '' : '',
        destination_type: transfer.destination_type ?? 'bank',
        destination_account_id:
          transfer.destination_type === 'bank' ? transfer.destination_account_id ?? '' : '',
        note: transfer.note ?? ''
      });
      setSourceAccount(transfer.source_type === 'bank' ? transfer.source_account ?? null : null);
      setDestinationAccount(
        transfer.destination_type === 'bank' ? transfer.destination_account ?? null : null
      );
      setError(null);
    },
    [reset]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingTransfer(null);
    reset(buildDefaultValues());
    setSourceAccount(null);
    setDestinationAccount(null);
    setError(null);
  }, [buildDefaultValues, reset]);

  const requestDelete = useCallback((transfer) => {
    setDeleteTarget(transfer);
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
      await apiFetch(`/transfers/${deleteTarget.id}`, { method: 'DELETE' });
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
      setError(null);
      if (editingTransfer && editingTransfer.id === deleteTarget.id) {
        handleCancelEdit();
      }
      setActiveTab('list');
      await loadTransfers();
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudo eliminar la transferencia';
      setError(message);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, editingTransfer, handleCancelEdit, loadTransfers]);

  const isEditing = Boolean(editingTransfer);
  const submitLabel = isEditing ? 'Actualizar transferencia' : 'Registrar transferencia';
  const cancelLabel = isEditing ? 'Cancelar edición' : 'Limpiar formulario';

  const onSubmit = async (values) => {
    if (sameAccountSelected) {
      setError('Selecciona cuentas diferentes para origen y destino.');
      return;
    }

    if (currencyMismatch) {
      setError('Las cuentas seleccionadas deben manejar la misma moneda.');
      return;
    }

    try {
      const payload = {
        amount: Number(values.amount),
        currency: forcedCurrency ?? values.currency,
        date: values.date,
        source_type: values.source_type,
        source_account_id: values.source_type === 'bank' ? values.source_account_id || null : null,
        destination_type: values.destination_type,
        destination_account_id:
          values.destination_type === 'bank' ? values.destination_account_id || null : null,
        note: values.note ? values.note.trim() : null
      };

      if (editingTransfer) {
        await apiFetch(`/transfers/${editingTransfer.id}`, {
          method: 'PUT',
          body: payload
        });
      } else {
        await apiFetch('/transfers', {
          method: 'POST',
          body: payload
        });
      }

      reset(buildDefaultValues());
      setSourceAccount(null);
      setDestinationAccount(null);
      setError(null);
      setEditingTransfer(null);
      setActiveTab('list');
      await loadTransfers();
    } catch (err) {
      console.error(err);
      const message = err.payload?.message ?? err.message ?? 'No se pudo registrar la transferencia';
      setError(message);
    }
  };

  const submittingDisabled = isSubmitting || currencyMismatch || sameAccountSelected;

  return (
    <div className="transfers-page">
      <header className="transfers-header">
        <div className="transfers-heading">
          <h1>Transferencias</h1>
          <p>Registra movimientos internos entre tus cuentas y consulta el historial.</p>
        </div>
        <div className="transfers-actions">
          <button
            type="button"
            className={`transfers-tab${activeTab === 'list' ? ' transfers-tab--active' : ''}`}
            onClick={() => {
              setActiveTab('list');
              setError(null);
            }}
          >
            <span aria-hidden>📋</span>
            Historial
          </button>
          <button
            type="button"
            className={`transfers-tab${activeTab === 'create' ? ' transfers-tab--active' : ''}`}
            onClick={() => {
              setActiveTab('create');
              if (isEditing) {
                handleCancelEdit();
              } else {
                reset(buildDefaultValues());
                setSourceAccount(null);
                setDestinationAccount(null);
                setError(null);
              }
            }}
          >
            <span aria-hidden>➕</span>
            Nueva transferencia
          </button>
        </div>
      </header>

      {Object.keys(totalsByCurrency).length ? (
        <section className="transfers-summary">
          {Object.entries(totalsByCurrency).map(([currency, total]) => (
            <article key={currency} className="transfers-summary-card">
              <span className="transfers-summary-label">Total registrado ({currency})</span>
              <strong className="transfers-summary-amount">{formatAmount(total)} {currency}</strong>
            </article>
          ))}
        </section>
      ) : null}

      {error ? <p className="transfers-error">{error}</p> : null}

      <div className="transfers-content">
        {activeTab === 'create' ? (
          <FormProvider {...form}>
            <form className="transfers-form" onSubmit={handleSubmit(onSubmit)}>
              {isEditing ? (
                <div className="transfers-form-banner">
                  <span>
                    Editando transferencia registrada el {formatDate(editingTransfer?.date)}.
                  </span>
                </div>
              ) : null}
              <div className="transfers-form-grid">
                <label className="transfers-field">
                  <span className="transfers-field__label">Monto</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    {...form.register('amount', {
                      required: 'Ingresa el monto a transferir.',
                      min: { value: 0.01, message: 'El monto debe ser mayor que cero.' }
                    })}
                  />
                  {form.formState.errors.amount ? (
                    <small className="field-error">{form.formState.errors.amount.message}</small>
                  ) : null}
                </label>

                <label className="transfers-field">
                  <span className="transfers-field__label">Fecha</span>
                  <input
                    type="date"
                    {...form.register('date', {
                      required: 'Selecciona la fecha de la transferencia.'
                    })}
                  />
                  {form.formState.errors.date ? (
                    <small className="field-error">{form.formState.errors.date.message}</small>
                  ) : null}
                </label>

                <label className="transfers-field">
                  <span className="transfers-field__label">Moneda</span>
                  <select
                    {...form.register('currency', {
                      required: 'Selecciona la moneda del movimiento.'
                    })}
                    disabled={Boolean(forcedCurrency)}
                  >
                    <option value="">Elige una moneda</option>
                    {CURRENCY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.currency ? (
                    <small className="field-error">{form.formState.errors.currency.message}</small>
                  ) : null}
                  {forcedCurrency ? (
                    <small className="transfers-field__hint">Moneda definida por la cuenta seleccionada.</small>
                  ) : null}
                </label>
              </div>

              <div className="transfers-selectors">
                <div className="transfers-selector">
                  <h2>Cuenta de origen</h2>
                  <AccountSelector
                    sourceField="source_type"
                    accountField="source_account_id"
                    label="Origen"
                    accountLabel="Cuenta bancaria origen"
                    onAccountChange={handleSourceAccountChange}
                    containerClass="transfers-account-selector"
                  />
                </div>

                <div className="transfers-selector">
                  <h2>Cuenta de destino</h2>
                  <AccountSelector
                    sourceField="destination_type"
                    accountField="destination_account_id"
                    label="Destino"
                    accountLabel="Cuenta bancaria destino"
                    onAccountChange={handleDestinationAccountChange}
                    containerClass="transfers-account-selector"
                    requiredAccountMessage="Selecciona la cuenta bancaria de destino."
                  />
                </div>
              </div>

              {currencyMismatch ? (
                <p className="transfers-warning">Las cuentas de origen y destino deben compartir la misma moneda.</p>
              ) : null}

              {sameAccountSelected ? (
                <p className="transfers-warning">No puedes transferir entre la misma cuenta bancaria.</p>
              ) : null}

              <label className="transfers-field transfers-field--full">
                <span className="transfers-field__label">Nota (opcional)</span>
                <textarea
                  rows={3}
                  placeholder="Describe la transferencia para futuras referencias"
                  {...form.register('note', {
                    maxLength: { value: 255, message: 'La nota no debe superar los 255 caracteres.' }
                  })}
                />
                {form.formState.errors.note ? (
                  <small className="field-error">{form.formState.errors.note.message}</small>
                ) : null}
              </label>

              <div className="transfers-form-actions">
                <button type="submit" className="transfers-submit" disabled={submittingDisabled}>
                  {isSubmitting ? 'Guardando...' : submitLabel}
                </button>
                <button
                  type="button"
                  className="transfers-cancel"
                  onClick={() => {
                    if (isEditing) {
                      handleCancelEdit();
                    } else {
                      reset(buildDefaultValues());
                      setSourceAccount(null);
                      setDestinationAccount(null);
                      setError(null);
                    }
                  }}
                  disabled={isSubmitting}
                >
                  {cancelLabel}
                </button>
              </div>
            </form>
          </FormProvider>
        ) : null}

        {activeTab === 'list' ? (
          <section className="transfers-list">
            {loading ? (
              <p className="transfers-placeholder">Cargando transferencias...</p>
            ) : transfers.length ? (
              <div className="transfers-table-wrapper">
                <table className="transfers-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Origen</th>
                      <th>Destino</th>
                      <th>Monto</th>
                      <th>Nota</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((transfer) => (
                      <tr key={transfer.id}>
                        <td data-label="Fecha">{formatDate(transfer.date)}</td>
                        <td data-label="Origen">
                          <span className="transfers-table-label">{TYPE_LABELS[transfer.source_type] ?? transfer.source_type}</span>
                          {transfer.source_type === 'bank' && transfer.source_account ? (
                            <span className="transfers-table-account">{describeLocation(transfer.source_type, transfer.source_account)}</span>
                          ) : null}
                        </td>
                        <td data-label="Destino">
                          <span className="transfers-table-label">{TYPE_LABELS[transfer.destination_type] ?? transfer.destination_type}</span>
                          {transfer.destination_type === 'bank' && transfer.destination_account ? (
                            <span className="transfers-table-account">{describeLocation(transfer.destination_type, transfer.destination_account)}</span>
                          ) : null}
                        </td>
                        <td data-label="Monto" className="transfers-table-amount">
                          <strong>{formatAmount(transfer.amount)}</strong>
                          <span>{transfer.currency}</span>
                        </td>
                        <td data-label="Nota">{transfer.note || '—'}</td>
                        <td data-label="Acciones" className="transfers-table-actions">
                          <button type="button" onClick={() => handleStartEdit(transfer)}>
                            Editar
                          </button>
                          <button type="button" onClick={() => requestDelete(transfer)}>
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="transfers-placeholder">Aún no has registrado transferencias.</p>
            )}
          </section>
        ) : null}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Eliminar transferencia"
        message="Esta acción no se puede deshacer. ¿Deseas eliminar la transferencia seleccionada?"
        confirmLabel={isDeleting ? 'Eliminando...' : 'Eliminar'}
        cancelLabel="Cancelar"
        confirmDisabled={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}

export default TransfersPage;
