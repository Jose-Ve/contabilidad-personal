import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { apiFetch } from '../services/apiClient.js';
import AccountFormModal from './AccountFormModal.jsx';
import { buildAccountOption } from '../utils/accounts.js';
import './AccountSelector.css';

const SOURCE_OPTIONS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'bank', label: 'Cuenta bancaria' }
];

function AccountSelector({
  sourceField,
  accountField,
  label,
  accountLabel,
  fieldClass,
  accountFieldClass,
  containerClass,
  onAccountChange,
  sourceSelectClass,
  accountSelectClass,
  requiredAccountMessage = 'Selecciona la cuenta bancaria específica.'
}) {
  const {
    register,
    watch,
    setValue,
    formState: { errors }
  } = useFormContext();

  const sourceValue = watch(sourceField);
  const accountValue = watch(accountField);

  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setAccountsError(null);
    setLoadingAccounts(true);
    try {
      const response = await apiFetch('/accounts');
      setAccounts(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error(error);
      const message = error.payload?.message ?? 'No se pudieron cargar las cuentas bancarias.';
      setAccountsError(message);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (sourceValue !== 'bank' && accountValue) {
      setValue(accountField, '', { shouldValidate: true, shouldDirty: true });
    }
  }, [sourceValue, accountValue, accountField, setValue]);

  const currentAccount = useMemo(() => {
    if (!accountValue) return null;
    return accounts.find((option) => option.id === accountValue) ?? null;
  }, [accountValue, accounts]);

  useEffect(() => {
    if (!onAccountChange) return;
    onAccountChange({
      source: sourceValue,
      accountId: sourceValue === 'bank' ? accountValue || null : null,
      account: sourceValue === 'bank' ? currentAccount : null
    });
  }, [sourceValue, accountValue, currentAccount, onAccountChange]);

  const {
    onChange: sourceOnChange,
    onBlur: sourceOnBlur,
    name: sourceName,
    ref: sourceRef,
    ...sourceRest
  } = register(sourceField, {
    validate: (value) => (value ? true : 'Selecciona el origen del movimiento.')
  });

  const {
    onChange: accountOnChange,
    onBlur: accountOnBlur,
    name: accountName,
    ref: accountRef,
    ...accountRest
  } = register(accountField, {
    validate: (value) => {
      if (sourceValue === 'bank') {
        return value ? true : requiredAccountMessage;
      }
      return true;
    }
  });

  const accountOptions = useMemo(() => {
    return accounts
      .map((account) => ({
        ...buildAccountOption(account),
        currency: account.currency
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [accounts]);

  const sourceError = errors?.[sourceField]?.message;
  const accountError = errors?.[accountField]?.message;

  const handleAccountCreated = useCallback(
    (account) => {
      setAccounts((prev) => [account, ...prev.filter((item) => item.id !== account.id)]);
      setValue(accountField, account.id, { shouldValidate: true, shouldDirty: true });
      setAccountsError(null);
      setIsModalOpen(false);
      if (onAccountChange) {
        onAccountChange({ source: 'bank', accountId: account.id, account });
      }
    },
    [accountField, onAccountChange, setValue]
  );

  const handleAccountUpdated = useCallback(
    (account) => {
      setAccounts((prev) => prev.map((item) => (item.id === account.id ? account : item)));
      setAccountsError(null);
      if (account.id === accountValue) {
        setValue(accountField, account.id, { shouldValidate: true, shouldDirty: true });
        if (onAccountChange) {
          onAccountChange({ source: 'bank', accountId: account.id, account });
        }
      }
    },
    [accountField, accountValue, onAccountChange, setValue]
  );

  const handleAccountDeleted = useCallback(
    (accountId) => {
      setAccounts((prev) => prev.filter((item) => item.id !== accountId));
      setAccountsError(null);
      if (accountValue === accountId) {
        setValue(accountField, '', { shouldValidate: true, shouldDirty: true });
        if (onAccountChange) {
          onAccountChange({ source: 'bank', accountId: null, account: null });
        }
      }
    },
    [accountField, accountValue, onAccountChange, setValue]
  );

  return (
    <div className={`account-selector ${containerClass ?? ''}`}>
      <label className={`account-selector__field ${fieldClass ?? ''}`}>
        <span>{label ?? 'Cuenta'}</span>
        <select
          name={sourceName}
          ref={sourceRef}
          {...sourceRest}
          className={sourceSelectClass}
          onChange={(event) => {
            sourceOnChange(event);
          }}
          onBlur={sourceOnBlur}
        >
          <option value="">Agregar origen</option>
          {SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {sourceError ? <small className="field-error">{sourceError}</small> : null}
      </label>

      <div className="account-selector__actions">
        {sourceValue === 'bank' ? (
          <div className="account-selector__field field-wrapper">
            <label className={accountFieldClass ?? fieldClass}>
            <span>{accountLabel ?? 'Cuenta bancaria'}</span>
            <select
              name={accountName}
              ref={accountRef}
              {...accountRest}
              className={accountSelectClass ?? sourceSelectClass}
              onChange={(event) => {
                accountOnChange(event);
              }}
              onBlur={accountOnBlur}
              disabled={loadingAccounts && accountOptions.length === 0}
            >
              <option value="">
                {loadingAccounts ? 'Cargando cuentas...' : 'Selecciona una cuenta'}
              </option>
              {accountOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {accountError ? <small className="field-error">{accountError}</small> : null}
            {accountsError ? <small className="field-error">{accountsError}</small> : null}
            {sourceValue === 'bank' && !loadingAccounts && accountOptions.length === 0 && !accountsError ? (
              <small className="account-selector__empty">No tienes cuentas registradas todavía.</small>
            ) : null}
            </label>
          </div>
        ) : null}
        {sourceValue === 'bank' ? (
          <button type="button" className="account-selector__add" onClick={() => setIsModalOpen(true)}>
            <span aria-hidden>➕</span> Gestionar cuentas bancarias
          </button>
        ) : null}
      </div>

      <AccountFormModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        accounts={accounts}
        onCreated={handleAccountCreated}
        onUpdated={handleAccountUpdated}
        onDeleted={handleAccountDeleted}
      />
    </div>
  );
}

export default AccountSelector;
