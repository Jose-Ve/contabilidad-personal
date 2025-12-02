import { useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../services/apiClient.js';
import './DashboardPage.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const EXCHANGE_RATE = 36.7; // 1 USD = 36.70 C$

const formatCurrency = (value, currency = 'NIO') =>
  new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(Number(value ?? 0));

const usdToCordobas = (value) => Number(value ?? 0) * EXCHANGE_RATE;
const normalizeToCordobas = (amount, currency) =>
  currency === 'USD' ? Number(amount ?? 0) * EXCHANGE_RATE : Number(amount ?? 0);

const palette = ['#6fd6ff', '#53fdd7', '#4dd2ff', '#7bf0c3', '#5eb5ff', '#3fb29f', '#9ae8ff', '#5ad6c9'];

function DashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [summary, setSummary] = useState({
    incomes: { total: 0, bank: 0, cash: 0 },
    expenses: { total: 0, bank: 0, cash: 0 },
    balance: 0
  });
  const [incomeSeries, setIncomeSeries] = useState([]);
  const [expenseDistribution, setExpenseDistribution] = useState([]);
  const [activeUsers, setActiveUsers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      const today = new Date();
      const fromDate = new Date(today);
      fromDate.setDate(today.getDate() - 14);
      const from = fromDate.toISOString().slice(0, 10);
      const to = today.toISOString().slice(0, 10);

      try {
        const balanceRequest = apiFetch('/balance?range=current-month');
        const incomesRequest = apiFetch(`/incomes?from=${from}&to=${to}`);
        const expensesRequest = apiFetch(`/expenses?from=${from}&to=${to}`);
        const usersRequest = isAdmin ? apiFetch('/admin/users') : Promise.resolve(null);

        const [balanceData, incomesData, expensesData, usersData] = await Promise.all([
          balanceRequest,
          incomesRequest,
          expensesRequest,
          usersRequest
        ]);

        const safeTotals = (data) => ({
          total: Number(data?.total ?? 0),
          bank: Number(data?.bank ?? 0),
          cash: Number(data?.cash ?? 0)
        });

        setSummary({
          incomes: safeTotals(balanceData?.incomes),
          expenses: safeTotals(balanceData?.expenses),
          balance: Number(balanceData?.balance ?? 0)
        });

        const dayBuckets = [];
        const tempDate = new Date(fromDate);
        for (let i = 0; i < 15; i += 1) {
          const key = tempDate.toISOString().slice(0, 10);
          dayBuckets.push({
            key,
            label: new Intl.DateTimeFormat('es-NI', { day: '2-digit', month: 'short' }).format(tempDate),
            total: 0
          });
          tempDate.setDate(tempDate.getDate() + 1);
        }

        (Array.isArray(incomesData) ? incomesData : []).forEach((income) => {
          const bucket = dayBuckets.find((day) => day.key === income.date.slice(0, 10));
          if (!bucket) return;
          const amountCordobas = normalizeToCordobas(income.amount, income.currency ?? 'NIO');
          bucket.total += amountCordobas;
        });

        setIncomeSeries(dayBuckets.map((bucket) => ({ label: bucket.label, value: bucket.total })));

        const distributionMap = new Map();
        (Array.isArray(expensesData) ? expensesData : []).forEach((expense) => {
          const key = expense.category_name ?? 'Sin categoría';
          const amountCordobas = normalizeToCordobas(expense.amount, expense.currency ?? 'NIO');
          distributionMap.set(key, (distributionMap.get(key) ?? 0) + amountCordobas);
        });

        setExpenseDistribution(Array.from(distributionMap.entries()).map(([label, value]) => ({ label, value })));
        setActiveUsers(Array.isArray(usersData) ? usersData.filter((user) => user.active).length : null);
        setError(null);
      } catch (err) {
        console.error(err);
        setError(err.message ?? 'No se pudo cargar el dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [isAdmin]);

  const incomeChartData = useMemo(
    () => ({
      labels: incomeSeries.map((item) => item.label),
      datasets: [
        {
          label: 'Ingresos (C$)',
          data: incomeSeries.map((item) => Number(item.value.toFixed(2))),
          backgroundColor: 'rgba(111, 214, 255, 0.78)',
          borderColor: '#6fd6ff',
          hoverBackgroundColor: 'rgba(111, 214, 255, 0.95)',
          borderRadius: 12,
          maxBarThickness: 36
        }
      ]
    }),
    [incomeSeries]
  );

  const incomeChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#071a2b',
          titleColor: '#6fd6ff',
          bodyColor: '#ffffff',
          borderColor: 'rgba(111, 214, 255, 0.35)',
          borderWidth: 1,
          callbacks: {
            label: (context) => `Ingresos: ${formatCurrency(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: 'rgba(111, 214, 255, 0.85)' }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(111, 214, 255, 0.2)' },
          ticks: {
            callback: (value) => formatCurrency(value).replace(/\u00A0/g, ' '),
            color: 'rgba(111, 214, 255, 0.85)'
          }
        }
      }
    }),
    []
  );

  const expensesChartData = useMemo(() => {
    const values = expenseDistribution.map((item) => Number(item.value.toFixed(2)));
    const colors = expenseDistribution.map((_, index) => palette[index % palette.length]);
    return {
      labels: expenseDistribution.map((item) => item.label),
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 3
        }
      ]
    };
  }, [expenseDistribution]);

  const expensesChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, color: 'rgba(111, 214, 255, 0.85)' }
        },
        tooltip: {
          backgroundColor: '#071a2b',
          titleColor: '#6fd6ff',
          bodyColor: '#ffffff',
          borderColor: 'rgba(111, 214, 255, 0.35)',
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const label = context.label ?? '';
              return `${label}: ${formatCurrency(context.parsed)}`;
            }
          }
        }
      },
      cutout: '60%'
    }),
    []
  );

  const highlightCards = useMemo(() => {
    const cards = [
      {
        title: 'Ingresos totales',
        value: formatCurrency(usdToCordobas(summary.incomes.total)),
        background: 'linear-gradient(135deg, rgba(111, 214, 255, 0.22) 0%, rgba(83, 253, 215, 0.08) 100%)',
        accent: '#6fd6ff',
        caption: `Banco ${formatCurrency(usdToCordobas(summary.incomes.bank))} · Efectivo ${formatCurrency(usdToCordobas(summary.incomes.cash))} (≈ ${formatCurrency(summary.incomes.total, 'USD')})`
      },
      {
        title: 'Gastos totales',
        value: formatCurrency(usdToCordobas(summary.expenses.total)),
        background: 'linear-gradient(135deg, rgba(111, 214, 255, 0.14) 0%, rgba(62, 116, 255, 0.08) 100%)',
        accent: '#6fd6ff',
        caption: `Banco ${formatCurrency(usdToCordobas(summary.expenses.bank))} · Efectivo ${formatCurrency(usdToCordobas(summary.expenses.cash))} (≈ ${formatCurrency(summary.expenses.total, 'USD')})`
      },
      {
        title: 'Balance actual',
        value: formatCurrency(usdToCordobas(summary.balance)),
        background:
          summary.balance >= 0
            ? 'linear-gradient(135deg, rgba(83, 253, 215, 0.22) 0%, rgba(111, 214, 255, 0.12) 100%)'
            : 'linear-gradient(135deg, rgba(255, 148, 148, 0.32) 0%, rgba(111, 214, 255, 0.08) 100%)',
        accent: summary.balance >= 0 ? '#6fd6ff' : '#ff9aa2',
        caption: `Ingresos - gastos (≈ ${formatCurrency(summary.balance, 'USD')})`
      }
    ];

    if (activeUsers !== null) {
      cards.push({
        title: 'Usuarios activos',
        value: String(activeUsers),
        background: 'linear-gradient(135deg, rgba(111, 214, 255, 0.18) 0%, rgba(6, 26, 43, 0.5) 100%)',
        accent: '#6fd6ff',
        caption: 'Cuentas habilitadas'
      });
    }

    return cards;
  }, [summary, activeUsers]);

  return (
    <section className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__heading">
          <h1>Dashboard financiero</h1>
          <p>Visualiza tus métricas clave y controla tu salud financiera.</p>
        </div>
        <div className="dashboard__range">
          <span>Rango</span>
          <p>Últimos 15 días</p>
        </div>
      </header>

      {loading ? (
        <article className="dashboard__state dashboard__state--loading">
          <p>Cargando información financiera...</p>
        </article>
      ) : error ? (
        <article className="dashboard__state dashboard__state--error">
          <p>{error}</p>
        </article>
      ) : (
        <>
          <div className="dashboard__charts">
            <article className="dashboard-card">
              <div className="dashboard-card__header">
                <h2>Ingresos recientes (últimos 15 días)</h2>
              </div>
              <div className="dashboard-card__body">
                {incomeSeries.some((item) => item.value > 0) ? (
                  <Bar data={incomeChartData} options={incomeChartOptions} />
                ) : (
                  <p className="dashboard-card__placeholder">No hay ingresos registrados en los últimos días.</p>
                )}
              </div>
            </article>

            <article className="dashboard-card">
              <div className="dashboard-card__header">
                <h2>Distribución de gastos por categoría</h2>
              </div>
              <div className="dashboard-card__body dashboard-card__body--centered">
                {expenseDistribution.length > 0 ? (
                  <div className="dashboard-card__chart">
                    <Doughnut data={expensesChartData} options={expensesChartOptions} />
                  </div>
                ) : (
                  <p className="dashboard-card__placeholder">Aún no hay gastos categorizados en este período.</p>
                )}
              </div>
            </article>
          </div>

          <div className="dashboard__highlights">
            {highlightCards.map((card) => (
              <article key={card.title} className="dashboard-highlight" style={{ background: card.background }}>
                <span className="dashboard-highlight__title" style={{ color: card.accent }}>
                  {card.title}
                </span>
                <strong className="dashboard-highlight__value">{card.value}</strong>
                <span className="dashboard-highlight__caption">{card.caption}</span>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default DashboardPage;
