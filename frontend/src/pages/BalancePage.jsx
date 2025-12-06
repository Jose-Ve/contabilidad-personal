import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, markSupabaseActivity } from '../services/supabaseClient.js';
import { formatAccountName } from '../utils/accounts.js';
import './BalancePage.css';

const USD_TO_NIO_RATE = 36.7; // 1 USD = 36.70 C$

const formatCurrency = (value, currency = 'NIO') =>
  new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(Number(value ?? 0));

const nioToUsd = (value) => (Number(value ?? 0) / USD_TO_NIO_RATE || 0);

const monthFormatter = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric'
});

const today = new Date();
const yearStart = new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10);
const todayISO = today.toISOString().slice(0, 10);

const formatMonthLabel = (value) => {
  if (!value) return '';
  const [year, month] = value.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  const label = monthFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

function BalancePage() {
  const [filters, setFilters] = useState({ from: yearStart, to: todayISO });
  const [data, setData] = useState({
    incomes: 0,
    expenses: 0,
    balance: 0,
    balanceBreakdown: { total: 0, bank: 0, cash: 0 },
    series: [],
    accounts: []
  });
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthsOverview, setMonthsOverview] = useState([]);
  const initialFetchDoneRef = useRef(false);
  const refreshTimerRef = useRef(null);

  const handleChange = useCallback((event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    if (name === 'from' || name === 'to') {
      setSelectedMonth(null);
    }
  }, []);

  const loadBalance = useCallback(
    async (query, { preserveMonths = false } = {}) => {
      setLoading(true);
      const activeFilters = query ?? filters;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams(activeFilters);
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/balance?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
          throw new Error('No se pudo calcular el balance');
        }
        const payload = await response.json();
        setData({
          incomes: payload.incomes,
          expenses: payload.expenses,
          balance: payload.balance,
          balanceBreakdown:
            payload.balanceBreakdown ?? {
              total: Number(payload.balance ?? 0),
              bank: 0,
              cash: 0
            },
          series: payload.series ?? {},
          accounts: Array.isArray(payload.accounts) ? payload.accounts : []
        });

        if (!preserveMonths) {
          const monthEntries = Array.isArray(payload?.series?.byMonth)
            ? payload.series.byMonth.map((item) => {
                const incomesNio = Number(item.incomes ?? 0);
                const expensesNio = Number(item.expenses ?? 0);
                const netNio = incomesNio - expensesNio;

                return {
                  month: item.month,
                  label: formatMonthLabel(item.month),
                  incomesNio,
                  incomesUsd: nioToUsd(incomesNio),
                  expensesNio,
                  expensesUsd: nioToUsd(expensesNio),
                  netNio,
                  netUsd: nioToUsd(netNio)
                };
              })
            : [];
          setMonthsOverview(monthEntries.sort((a, b) => (a.month < b.month ? 1 : -1)));
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
        setHasLoaded(true);
      }
    },
    [filters]
  );

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void loadBalance(undefined, { preserveMonths: false });
    }, 300);
  }, [loadBalance]);

  useEffect(() => {
    if (initialFetchDoneRef.current) {
      return;
    }

    initialFetchDoneRef.current = true;
    void loadBalance(filters);
  }, [filters, loadBalance]);

  useEffect(() => {
    const channel = supabase
      .channel('balance-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes' }, () => {
        markSupabaseActivity();
        scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        markSupabaseActivity();
        scheduleRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, () => {
        markSupabaseActivity();
        scheduleRefresh();
      })
      .subscribe();

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [scheduleRefresh]);

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
      const nextFilters = { ...filters, from: bounds.from, to: bounds.to };
      setSelectedMonth(monthKey);
      setFilters(nextFilters);
      void loadBalance(nextFilters, { preserveMonths: true });
    },
    [filters, loadBalance]
  );

  const summary = useMemo(() => {
    const normalizeTotals = (value) => {
      if (value && typeof value === 'object') {
        return {
          total: Number(value.total ?? 0),
          bank: Number(value.bank ?? 0),
          cash: Number(value.cash ?? 0)
        };
      }
      const total = Number(value ?? 0);
      return { total, bank: 0, cash: 0 };
    };

    const balanceBreakdown = normalizeTotals(
      data.balanceBreakdown ?? { total: Number(data.balance ?? 0) }
    );

    return {
      incomes: normalizeTotals(data.incomes),
      expenses: normalizeTotals(data.expenses),
      balance: Number(data.balance ?? 0),
      balanceBreakdown
    };
  }, [data]);

  const accountsSummary = useMemo(() => {
    if (!Array.isArray(data.accounts) || data.accounts.length === 0) {
      return [];
    }

    return data.accounts.map((entry, index) => {
      const accountId = entry.account_id ?? entry.account?.id ?? `account-${index}`;
      const label = formatAccountName(entry.account) || 'Cuenta bancaria';
      const incomesNio = Number(entry.incomes?.nio ?? entry.incomes ?? 0);
      const incomesUsd = Number(entry.incomes?.usd ?? incomesNio / USD_TO_NIO_RATE);
      const expensesNio = Number(entry.expenses?.nio ?? entry.expenses ?? 0);
      const expensesUsd = Number(entry.expenses?.usd ?? expensesNio / USD_TO_NIO_RATE);
      const netNio = Number(entry.net?.nio ?? entry.net ?? incomesNio - expensesNio);
      const netUsd = Number(entry.net?.usd ?? netNio / USD_TO_NIO_RATE);

      return {
        id: accountId,
        label,
        institution:
          entry.account?.bank_institution === 'Otro'
            ? entry.account?.institution_name ?? null
            : entry.account?.bank_institution ?? null,
        currency: entry.account?.currency ?? 'NIO',
        incomes: { nio: incomesNio, usd: incomesUsd },
        expenses: { nio: expensesNio, usd: expensesUsd },
        net: { nio: netNio, usd: netUsd }
      };
    });
  }, [data.accounts]);

  const monthlySeries = useMemo(() => {
    // Mantiene un saldo acumulado para reflejar el arrastre entre meses en ambas monedas.
    const byMonth = data?.series?.byMonth ?? [];
    let runningCarryNio = 0;

    return byMonth.map((item) => {
      const incomesNio = Number(item.incomes ?? 0);
      const expensesNio = Number(item.expenses ?? 0);
      const netNio = incomesNio - expensesNio;
      const carryInNio = runningCarryNio;
      runningCarryNio += netNio;

      return {
        month: item.month,
        label: formatMonthLabel(item.month),
        incomesNio,
        incomesUsd: nioToUsd(incomesNio),
        expensesNio,
        expensesUsd: nioToUsd(expensesNio),
        netNio,
        netUsd: nioToUsd(netNio),
        carryInNio,
        carryInUsd: nioToUsd(carryInNio),
        carryOutNio: runningCarryNio,
        carryOutUsd: nioToUsd(runningCarryNio)
      };
    });
  }, [data?.series]);

  const visibleSeries = useMemo(() => {
    if (!selectedMonth) {
      return monthlySeries;
    }
    return monthlySeries.filter((item) => item.month === selectedMonth);
  }, [monthlySeries, selectedMonth]);

  return (
    <section className="balance">
      <header className="balance__header">
        <div className="balance__intro">
          <h1>Balance</h1>
          <p>Filtra por rango de fechas para comparar tus ingresos y gastos.</p>
        </div>
        <div className="balance__overview">
          <span className="balance__overview-label">Balance general</span>
          <strong className={`balance__overview-value ${summary.balance >= 0 ? 'is-positive' : 'is-negative'}`}>
            {formatCurrency(summary.balance)}
          </strong>
          <span className="balance__overview-detail">
            Ingresos: {formatCurrency(summary.incomes.total)} (≈ {formatCurrency(nioToUsd(summary.incomes.total), 'USD')})
          </span>
          <span className="balance__overview-detail">
            Gastos: {formatCurrency(summary.expenses.total)} (≈ {formatCurrency(nioToUsd(summary.expenses.total), 'USD')})
          </span>
        </div>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSelectedMonth(null);
          void loadBalance(filters);
        }}
        className="balance-filters"
      >
        <label className="balance-field">
          <span>Desde</span>
          <input type="date" name="from" value={filters.from} onChange={handleChange} className="balance-input" />
        </label>
        <label className="balance-field">
          <span>Hasta</span>
          <input type="date" name="to" value={filters.to} onChange={handleChange} className="balance-input" />
        </label>
        <button type="submit" className="balance-button" disabled={loading}>
          {loading ? 'Calculando...' : 'Aplicar filtros'}
        </button>
      </form>

      {loading ? (
        <p className="balance__loading">Calculando balance...</p>
      ) : (
        <div className="balance-grid">
          <article className="balance-card">
            <p className="balance-card__title">Ingresos</p>
            <p className="balance-card__value is-positive">{formatCurrency(summary.incomes.total)}</p>
            <p className="balance-card__detail">≈ {formatCurrency(nioToUsd(summary.incomes.total), 'USD')}</p>
            <p className="balance-card__detail">
              Banco: {formatCurrency(summary.incomes.bank)} (≈ {formatCurrency(nioToUsd(summary.incomes.bank), 'USD')})
            </p>
            <p className="balance-card__detail">
              Efectivo: {formatCurrency(summary.incomes.cash)} (≈ {formatCurrency(nioToUsd(summary.incomes.cash), 'USD')})
            </p>
            {accountsSummary.length > 0 ? (
              <ul className="balance-card__accounts">
                {accountsSummary.map((account) => (
                  <li key={`${account.id}-incomes`}>
                    <span className="balance-card__account-name">{account.label}</span>
                    <span>
                      {formatCurrency(account.incomes.nio)} (≈ {formatCurrency(account.incomes.usd, 'USD')})
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
          <article className="balance-card">
            <p className="balance-card__title">Gastos</p>
            <p className="balance-card__value is-negative">{formatCurrency(summary.expenses.total)}</p>
            <p className="balance-card__detail">≈ {formatCurrency(nioToUsd(summary.expenses.total), 'USD')}</p>
            <p className="balance-card__detail">
              Banco: {formatCurrency(summary.expenses.bank)} (≈ {formatCurrency(nioToUsd(summary.expenses.bank), 'USD')})
            </p>
            <p className="balance-card__detail">
              Efectivo: {formatCurrency(summary.expenses.cash)} (≈ {formatCurrency(nioToUsd(summary.expenses.cash), 'USD')})
            </p>
            {accountsSummary.length > 0 ? (
              <ul className="balance-card__accounts">
                {accountsSummary.map((account) => (
                  <li key={`${account.id}-expenses`}>
                    <span className="balance-card__account-name">{account.label}</span>
                    <span>
                      {formatCurrency(account.expenses.nio)} (≈ {formatCurrency(account.expenses.usd, 'USD')})
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
          <article className="balance-card">
            <p className="balance-card__title">Resultado</p>
            <p className={`balance-card__value ${summary.balanceBreakdown.total >= 0 ? 'is-positive' : 'is-negative'}`}>
              {formatCurrency(summary.balanceBreakdown.total)}
            </p>
            <p className="balance-card__detail">
              ≈ {formatCurrency(nioToUsd(summary.balanceBreakdown.total), 'USD')}
            </p>
            <p className="balance-card__detail">Actualizado al {new Date(filters.to).toLocaleDateString()}</p>
            <p className="balance-card__detail">
              Banco: {formatCurrency(summary.balanceBreakdown.bank)} (≈ {formatCurrency(
                nioToUsd(summary.balanceBreakdown.bank),
                'USD'
              )})
            </p>
            <p className="balance-card__detail">
              Efectivo: {formatCurrency(summary.balanceBreakdown.cash)} (≈ {formatCurrency(
                nioToUsd(summary.balanceBreakdown.cash),
                'USD'
              )})
            </p>
            {accountsSummary.length > 0 ? (
              <ul className="balance-card__accounts">
                {accountsSummary.map((account) => (
                  <li key={`${account.id}-net`}>
                    <span className="balance-card__account-name">{account.label}</span>
                    <span className={account.net.nio >= 0 ? 'is-positive' : 'is-negative'}>
                      {formatCurrency(account.net.nio)} (≈ {formatCurrency(account.net.usd, 'USD')})
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        </div>
      )}

      {!loading && monthlySeries.length > 0 ? (
        <section className="balance-monthly">
          <header className="balance-monthly__header">
            <h2>Movimientos mensuales</h2>
            <p>Revisa cómo se comporta tu flujo de efectivo cada mes y cuánto saldo arrastras al siguiente.</p>
            {monthsOverview.length > 0 ? (
              <div className="balance-monthly__selector">
                {monthsOverview.map((month) => (
                  <button
                    key={month.month}
                    type="button"
                    className={`balance-monthly__chip${month.month === selectedMonth ? ' is-active' : ''}`}
                    onClick={() => handleMonthSelect(month.month)}
                  >
                    <span className="balance-monthly__chip-label">{month.label}</span>
                    <span className="balance-monthly__chip-count">
                      {month.netUsd >= 0 ? '+' : ''}{formatCurrency(month.netNio)} (≈ {formatCurrency(month.netUsd, 'USD')})
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </header>
          <div className="balance-monthly__grid">
            {visibleSeries.map((item) => (
              <article key={item.month} className="balance-monthly__card">
                <h3>{item.label}</h3>
                <dl className="balance-monthly__details">
                  <div className="balance-monthly__row">
                    <dt>Saldo inicial</dt>
                    <dd className={`balance-monthly__number ${item.carryInUsd >= 0 ? 'is-positive' : 'is-negative'}`}>
                      {formatCurrency(item.carryInNio)} (≈ {formatCurrency(item.carryInUsd, 'USD')})
                    </dd>
                  </div>
                  <div className="balance-monthly__row">
                    <dt>Ingresos</dt>
                    <dd className="balance-monthly__number is-positive">
                      {formatCurrency(item.incomesNio)} (≈ {formatCurrency(item.incomesUsd, 'USD')})
                    </dd>
                  </div>
                  <div className="balance-monthly__row">
                    <dt>Gastos</dt>
                    <dd className="balance-monthly__number is-negative">
                      {formatCurrency(item.expensesNio)} (≈ {formatCurrency(item.expensesUsd, 'USD')})
                    </dd>
                  </div>
                  <div className="balance-monthly__row">
                    <dt>Resultado del mes</dt>
                    <dd className={`balance-monthly__number ${item.netUsd >= 0 ? 'is-positive' : 'is-negative'}`}>
                      {formatCurrency(item.netNio)} (≈ {formatCurrency(item.netUsd, 'USD')})
                    </dd>
                  </div>
                  <div className="balance-monthly__row">
                    <dt>Saldo arrastrado</dt>
                    <dd className={`balance-monthly__number ${item.carryOutUsd >= 0 ? 'is-positive' : 'is-negative'}`}>
                      {formatCurrency(item.carryOutNio)} (≈ {formatCurrency(item.carryOutUsd, 'USD')})
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && hasLoaded && monthlySeries.length === 0 ? (
        <p className="balance-monthly__empty">Registra ingresos y gastos para ver cómo se comporta tu balance mensual.</p>
      ) : null}
    </section>
  );
}

export default BalancePage;
