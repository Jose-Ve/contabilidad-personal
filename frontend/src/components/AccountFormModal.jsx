import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import { apiFetch } from '../services/apiClient.js';
import { ACCOUNT_INSTITUTIONS, formatAccountName, getInstitutionLabel } from '../utils/accounts.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import './AccountFormModal.css';

const DEFAULT_VALUES = {
  bank_institution: 'BAC',
  institution_name: '',
  currency: 'NIO',
  initial_balance: ''
};

function AccountFormModal({ open, onClose, accounts = [], onCreated, onUpdated, onDeleted }) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting }
  } = useForm({
    defaultValues: DEFAULT_VALUES
  });

  const [errorMessage, setErrorMessage] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const selectedInstitution = watch('bank_institution');

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => {
      const labelA = formatAccountName(a) || a?.name || '';
      const labelB = formatAccountName(b) || b?.name || '';
      return labelA.localeCompare(labelB, 'es', { sensitivity: 'base' });
    });
  }, [accounts]);

  const startCreate = useCallback(() => {
    setEditingAccount(null);
    reset(DEFAULT_VALUES);
    setErrorMessage(null);
    setDeleteTarget(null);
  }, [reset]);

  const startEdit = useCallback(
    (account) => {
      if (!account) return;
      setEditingAccount(account);
      reset({
        bank_institution: account.bank_institution ?? 'BAC',
        institution_name: account.bank_institution === 'Otro' ? account.institution_name ?? '' : '',
        currency: account.currency ?? 'NIO',
        initial_balance:
          account.initial_balance === null || account.initial_balance === undefined
            ? ''
            : `${Number(account.initial_balance)}`
      });
      setErrorMessage(null);
    },
    [reset]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setErrorMessage(null);
    setIsDeleting(true);
    try {
      await apiFetch(`/accounts/${deleteTarget.id}`, { method: 'DELETE' });
      onDeleted?.(deleteTarget.id);
      setIsDeleting(false);
      setDeleteTarget(null);
      if (editingAccount?.id === deleteTarget.id) {
        startCreate();
      }
    } catch (error) {
      console.error(error);
      const message = error.payload?.message ?? error.message ?? 'No se pudo eliminar la cuenta bancaria.';
      setErrorMessage(message);
      setIsDeleting(false);
    }
  }, [deleteTarget, editingAccount, onDeleted, startCreate]);

  useEffect(() => {
    if (!open) {
      startCreate();
      setDeleteTarget(null);
    }
  }, [open, startCreate]);

  if (!open) {
    return null;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const onSubmit = async (values) => {
    setErrorMessage(null);
    const institutionName = values.bank_institution === 'Otro' ? values.institution_name?.trim() ?? '' : null;
    if (values.bank_institution === 'Otro' && !institutionName) {
      setErrorMessage('Indica el nombre del banco.');
      return;
    }
    const derivedNameBase =
      values.bank_institution === 'Otro'
        ? institutionName
        : getInstitutionLabel(values.bank_institution) ?? values.bank_institution;
    const derivedName = `${derivedNameBase ?? ''}`.trim();
    const payload = {
      bank_institution: values.bank_institution,
      institution_name: institutionName,
      currency: values.currency,
      name: derivedName || getInstitutionLabel(values.bank_institution) || values.bank_institution,
      initial_balance:
        values.initial_balance === '' || values.initial_balance === null || Number.isNaN(Number(values.initial_balance))
          ? null
          : Number(values.initial_balance)
    };

    try {
      if (editingAccount) {
        const updated = await apiFetch(`/accounts/${editingAccount.id}`, {
          method: 'PUT',
          body: payload
        });
        const nextAccount = updated ?? { ...editingAccount, ...payload, id: editingAccount.id };
        onUpdated?.(nextAccount);
        setErrorMessage(null);
        startCreate();
      } else {
        const created = await apiFetch('/accounts', {
          method: 'POST',
          body: payload
        });
        onCreated?.(created);
        reset({
          ...DEFAULT_VALUES,
          bank_institution: created?.bank_institution ?? 'BAC',
          currency: created?.currency ?? 'NIO'
        });
        setErrorMessage(null);
      }
    } catch (error) {
      console.error(error);
      const defaultMessage = editingAccount ? 'No se pudo actualizar la cuenta bancaria.' : 'No se pudo crear la cuenta bancaria.';
      const message = error.payload?.message ?? error.message ?? defaultMessage;
      setErrorMessage(message);
    }
  };

  return createPortal(
    <div className="account-modal" role="dialog" aria-modal="true">
      <div
        className="account-modal__backdrop"
        onClick={() => {
          if (!isSubmitting) onClose?.();
        }}
      />
      <div className="account-modal__content">
        <header className="account-modal__header">
          <h2>{editingAccount ? 'Editar cuenta bancaria' : 'Crear cuenta bancaria'}</h2>
          <button
            type="button"
            className="account-modal__close"
            onClick={() => {
              if (!isSubmitting && !isDeleting) onClose?.();
            }}
          >
            Cerrar
          </button>
        </header>
        <div className="account-modal__body">
          <section className="account-modal__panel">
            <p className="account-modal__description">
              Gestiona tus cuentas para asociar cada movimiento a la institución y moneda correcta.
            </p>
            <form onSubmit={handleSubmit(onSubmit)} className="account-modal__form">
              <label className="account-modal__field">
                <span>Institución</span>
                <select {...register('bank_institution')} className="account-modal__input">
                  {ACCOUNT_INSTITUTIONS.map((institution) => (
                    <option key={institution.value} value={institution.value}>
                      {institution.label}
                    </option>
                  ))}
                </select>
              </label>

              {selectedInstitution === 'Otro' ? (
                <label className="account-modal__field">
                  <span>Nombre del banco</span>
                  <input
                    type="text"
                    placeholder="Ingresa el nombre del banco"
                    {...register('institution_name', {
                      required: 'Indica el nombre del banco.'
                    })}
                    className="account-modal__input"
                    required
                  />
                </label>
              ) : null}

              <label className="account-modal__field">
                <span>Moneda</span>
                <select {...register('currency')} className="account-modal__input">
                  <option value="NIO">Córdoba nicaragüense (C$)</option>
                  <option value="USD">Dólar estadounidense ($)</option>
                </select>
              </label>

              <label className="account-modal__field">
                <span>Saldo inicial (opcional)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register('initial_balance')}
                  className="account-modal__input"
                />
              </label>

              {errorMessage ? <p className="account-modal__error">{errorMessage}</p> : null}

              <div className="account-modal__actions">
                <button
                  type="button"
                  className="account-modal__button"
                  onClick={() => {
                    if (!isSubmitting && !isDeleting) onClose?.();
                  }}
                  disabled={isSubmitting || isDeleting}
                >
                  Cancelar
                </button>
                {editingAccount ? (
                  <button
                    type="button"
                    className="account-modal__button account-modal__button--danger"
                    onClick={() => {
                      if (!isSubmitting && !isDeleting) setDeleteTarget(editingAccount);
                    }}
                    disabled={isSubmitting || isDeleting}
                  >
                    {isDeleting ? 'Eliminando…' : 'Eliminar'}
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="account-modal__button account-modal__button--primary"
                  disabled={isSubmitting || isDeleting}
                >
                  {isSubmitting ? 'Guardando…' : editingAccount ? 'Actualizar' : 'Guardar cuenta'}
                </button>
              </div>
            </form>
          </section>
          <aside className="account-modal__aside">
            <div className="account-modal__manage-header">
              <h3>Cuentas registradas</h3>
              <button
                type="button"
                className="account-modal__manage-new"
                onClick={() => {
                  if (!isSubmitting && !isDeleting) startCreate();
                }}
                disabled={isSubmitting || isDeleting}
              >
                Nueva
              </button>
            </div>
            {sortedAccounts.length ? (
              <ul className="account-modal__list">
                {sortedAccounts.map((account) => {
                  const isActive = editingAccount?.id === account.id;
                  return (
                    <li key={account.id}>
                      <button
                        type="button"
                        className={`account-modal__list-item${isActive ? ' is-active' : ''}`}
                        onClick={() => {
                          if (!isSubmitting && !isDeleting) startEdit(account);
                        }}
                        disabled={isSubmitting || isDeleting}
                      >
                        <span className="account-modal__list-name">{formatAccountName(account) || account.name || 'Sin nombre'}</span>
                        <span className="account-modal__list-meta">{account.currency ?? 'N/A'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="account-modal__list-empty">Aún no registras cuentas.</p>
            )}
          </aside>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar cuenta bancaria"
        message="Esta acción eliminará la cuenta seleccionada y dejará sin asignar los movimientos relacionados. ¿Deseas continuar?"
        confirmLabel={isDeleting ? 'Eliminando…' : 'Eliminar'}
        cancelLabel="Cancelar"
        confirmDisabled={isDeleting}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (!isDeleting) void handleDelete();
        }}
      />
    </div>,
    document.body
  );
}

export default AccountFormModal;
