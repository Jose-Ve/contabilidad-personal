import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { apiFetch } from '../services/apiClient.js';
import { formatAccountName } from '../utils/accounts.js';
import './ReportsPage.css';

const USD_TO_NIO_RATE = 36.7;

const DATASETS = [
  { value: 'incomes', label: 'Ingresos' },
  { value: 'expenses', label: 'Gastos' },
  { value: 'balance', label: 'Balance' }
];

const SOURCE_LABELS = {
  bank: 'Cuenta bancaria',
  cash: 'Efectivo'
};

const SOURCE_FALLBACK = 'Efectivo';

const resolveOriginLabel = (row) => {
  const type = row?.source ?? 'cash';
  if (type === 'bank') {
    if (row?.account) {
      const label = formatAccountName(row.account);
      if (label) {
        return label;
      }
    }
    if (row?.account?.institution_name) {
      return row.account.institution_name;
    }
    if (row?.account?.bank_institution) {
      return row.account.bank_institution;
    }
    return 'Cuenta bancaria';
  }

  return SOURCE_LABELS[type] ?? SOURCE_FALLBACK;
};

const numberFormatter = new Intl.NumberFormat('es-NI', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat('es-NI', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

const monthFormatter = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric'
});

const formatCurrencyValue = (value, currency = 'NIO') => {
  const symbol = currency === 'USD' ? '$' : 'C$';
  return `${symbol}${numberFormatter.format(Number(value ?? 0))}`;
};

const parseDateValue = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const isoMatch = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(`${value}`.trim());
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp);
  }

  return null;
};

const formatDate = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return '-';
  }

  try {
    return dateFormatter.format(parsed);
  } catch (error) {
    console.warn('No se pudo formatear la fecha', error);
    return '-';
  }
};

const formatMonthLabel = (monthKey) => {
  if (!monthKey) {
    return '';
  }

  const [year, month] = monthKey.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  const label = monthFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const getMonthBounds = (monthKey) => {
  if (!monthKey) {
    return { from: '', to: '' };
  }

  const [year, month] = monthKey.split('-');
  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 0);

  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
  };
};

const generateMonthPresets = (months) => {
  const today = new Date();
  const presets = [];

  for (let index = 0; index < months; index += 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    presets.push({
      value: key,
      label: formatMonthLabel(key)
    });
  }

  return presets;
};

const getCurrentMonthFilters = () => {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  return getMonthBounds(key);
};

const getDefaultFilters = () => getCurrentMonthFilters();

const buildRangeSuffix = (filters) => {
  const from = filters.from ?? '';
  const to = filters.to ?? '';

  if (!from && !to) {
    return 'sin-rango';
  }

  if (from && to) {
    return `${from}_a_${to}`;
  }

  if (from) {
    return `desde_${from}`;
  }

  return `hasta_${to}`;
};

const summarizeMovements = (rows) => {
  const totalsByCurrency = rows.reduce((acc, row) => {
    const currency = row.currency ?? 'NIO';
    const amount = Number(row.amount ?? 0);
    acc[currency] = (acc[currency] ?? 0) + amount;
    return acc;
  }, {});

  return {
    count: rows.length,
    totalsByCurrency
  };
};

const groupMovementsByMonth = (rows) => {
  const buckets = new Map();

  rows.forEach((row) => {
    if (!row.date) {
      return;
    }

    const monthKey = row.date.slice(0, 7);

    if (!buckets.has(monthKey)) {
      buckets.set(monthKey, {
        month: monthKey,
        label: formatMonthLabel(monthKey),
        count: 0,
        totalsByCurrency: {}
      });
    }

    const bucket = buckets.get(monthKey);
    bucket.count += 1;

    const currency = row.currency ?? 'NIO';
    const amount = Number(row.amount ?? 0);
    bucket.totalsByCurrency[currency] = (bucket.totalsByCurrency[currency] ?? 0) + amount;
  });

  return Array.from(buckets.values()).sort((a, b) => (a.month < b.month ? 1 : -1));
};

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

const buildBalanceReport = (payload) => {
  const summarySource = payload?.summary ?? payload ?? {};
  const summary = {
    incomes: normalizeTotals(summarySource.incomes),
    expenses: normalizeTotals(summarySource.expenses),
    balance: Number(summarySource.balance ?? 0)
  };

  const series = Array.isArray(payload?.series?.byMonth)
    ? payload.series.byMonth
    : Array.isArray(payload?.rows)
      ? payload.rows
      : [];

  let runningCarry = Number(payload?.openingBalance ?? 0);

  const rows = series.map((item) => {
    const incomes = Number(item.incomes ?? item.total_incomes ?? 0);
    const expenses = Number(item.expenses ?? item.total_expenses ?? 0);
    const net = incomes - expenses;
    const carryIn = runningCarry;
    runningCarry += net;

    return {
      month: item.month ?? item.label ?? '',
      label: formatMonthLabel(item.month ?? item.label ?? ''),
      incomes,
      expenses,
      net,
      carryIn,
      carryOut: runningCarry
    };
  });

  const accounts = Array.isArray(payload?.accounts)
    ? payload.accounts.map((entry) => {
        const accountId = entry.account_id ?? entry.account?.id ?? null;
        const account = entry.account ?? null;

        const incomesNio = Number(entry?.incomes?.nio ?? entry?.incomes ?? 0);
        const incomesUsd = Number(entry?.incomes?.usd ?? incomesNio / USD_TO_NIO_RATE);
        const expensesNio = Number(entry?.expenses?.nio ?? entry?.expenses ?? 0);
        const expensesUsd = Number(entry?.expenses?.usd ?? expensesNio / USD_TO_NIO_RATE);
        const netNio = Number(entry?.net?.nio ?? entry?.net ?? incomesNio - expensesNio);
        const netUsd = Number(entry?.net?.usd ?? netNio / USD_TO_NIO_RATE);

        return {
          accountId,
          account,
          incomes: { nio: incomesNio, usd: incomesUsd },
          expenses: { nio: expensesNio, usd: expensesUsd },
          net: { nio: netNio, usd: netUsd }
        };
      })
    : [];

  return { summary, rows, accounts };
};

const downloadWorkbook = async (workbook, filename) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

function ReportsPage() {
  const [dataset, setDataset] = useState('incomes');
  const [filters, setFilters] = useState(() => getDefaultFilters());
  const [selectedPreset, setSelectedPreset] = useState('custom');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState({ rows: [], summary: null, monthly: [], accounts: [] });
  const [appliedFilters, setAppliedFilters] = useState(() => getDefaultFilters());
  const [appliedDataset, setAppliedDataset] = useState('incomes');

  const datasetRef = useRef(dataset);
  const filtersRef = useRef(filters);

  useEffect(() => {
    datasetRef.current = dataset;
  }, [dataset]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const monthPresets = useMemo(() => generateMonthPresets(6), []);

  useEffect(() => {
    const presetMatch = monthPresets.find((preset) => {
      const bounds = getMonthBounds(preset.value);
      return filters.from === bounds.from && filters.to === bounds.to;
    });

    setSelectedPreset(presetMatch ? presetMatch.value : 'custom');
  }, [filters.from, filters.to, monthPresets]);

  const loadReport = useCallback(async ({ dataset: overrideDataset, filters: overrideFilters } = {}) => {
    const datasetToUse = overrideDataset ?? datasetRef.current;
    const filtersToUse = overrideFilters ?? filtersRef.current;

    setLoading(true);
    setError(null);

    try {
      const search = new URLSearchParams();
      if (filtersToUse.from) {
        search.set('from', filtersToUse.from);
      }
      if (filtersToUse.to) {
        search.set('to', filtersToUse.to);
      }

      const queryString = search.toString();

      if (datasetToUse === 'incomes' || datasetToUse === 'expenses') {
        const path = datasetToUse === 'incomes' ? '/incomes' : '/expenses';
        const response = await apiFetch(`${path}${queryString ? `?${queryString}` : ''}`);
        const rows = Array.isArray(response)
          ? [...response].sort((a, b) => {
              const dateA = parseDateValue(a.date);
              const dateB = parseDateValue(b.date);
              const timeA = dateA ? dateA.getTime() : 0;
              const timeB = dateB ? dateB.getTime() : 0;
              return timeB - timeA;
            })
          : [];
        const summary = summarizeMovements(rows);
        const monthly = groupMovementsByMonth(rows);
        setReportData({ rows, summary, monthly, accounts: [] });
      } else {
        const balancePath = queryString ? `/balance?${queryString}` : '/balance';
        const response = await apiFetch(balancePath);
        const { summary, rows, accounts } = buildBalanceReport(response ?? {});
        setReportData({ rows, summary, monthly: rows, accounts: accounts ?? [] });
      }

      setAppliedFilters({ ...filtersToUse });
      setAppliedDataset(datasetToUse);
    } catch (fetchError) {
      console.error('Error generando reporte', fetchError);
      const message = fetchError.payload?.message ?? fetchError.message ?? 'No se pudo generar el reporte con los filtros seleccionados.';
      setError(message);
      setReportData({ rows: [], summary: null, monthly: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport({ dataset, filters });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDatasetChange = (value) => {
    setDataset(value);
    datasetRef.current = value;
    void loadReport({ dataset: value });
  };

  const handlePresetSelect = (value) => {
    if (!value || value === 'custom') {
      setSelectedPreset('custom');
      return;
    }

    const bounds = getMonthBounds(value);
    const nextFilters = { ...filtersRef.current, ...bounds };
    setSelectedPreset(value);
    setFilters(nextFilters);
    filtersRef.current = nextFilters;
    void loadReport({ filters: nextFilters });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    filtersRef.current = filters;
    void loadReport({ filters });
  };

  const hasRows = reportData.rows.length > 0;
  const datasetLabel = DATASETS.find((option) => option.value === appliedDataset)?.label ?? 'Reporte';
  const rangeSuffix = buildRangeSuffix(appliedFilters);

  const handleExportExcel = async () => {
    if (!hasRows) {
      return;
    }

    try {
      const excelModule = await import('exceljs');
      const ExcelJS = excelModule.default ?? excelModule;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Contabilidad Program';
      workbook.created = new Date();

      if (appliedDataset === 'incomes' || appliedDataset === 'expenses') {
        const worksheet = workbook.addWorksheet(datasetLabel);
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        const tableRows = reportData.rows.map((row) => {
          const amount = Number(row.amount ?? 0);
          const currency = row.currency ?? 'NIO';
          const nioValue = currency === 'NIO' ? amount : amount * USD_TO_NIO_RATE;
          const usdValue = currency === 'USD' ? amount : amount / USD_TO_NIO_RATE;

          return [
            row.date ? parseDateValue(row.date) : '',
            row.category_name ?? 'Sin categoría',
            resolveOriginLabel(row),
            currency,
            amount,
            nioValue,
            usdValue,
            row.note ?? ''
          ];
        });

        const tableName = `Movimientos_${Date.now().toString(36)}`.slice(0, 30);
        worksheet.addTable({
          name: tableName,
          ref: 'A1',
          headerRow: true,
          style: { theme: 'TableStyleMedium9', showRowStripes: true, showFirstColumn: true },
          columns: [
            { name: 'Fecha', filterButton: true },
            { name: 'Categoría', filterButton: true },
            { name: 'Origen', filterButton: true },
            { name: 'Moneda', filterButton: true },
            { name: 'Monto original', filterButton: true },
            { name: 'Monto (C$)', filterButton: true },
            { name: 'Monto (USD)', filterButton: true },
            { name: 'Nota', filterButton: true }
          ],
          rows: tableRows
        });

        worksheet.getColumn(1).numFmt = 'dd/mm/yyyy';
        const widths = [12, 24, 20, 10, 18, 18, 18, 36];
        widths.forEach((width, index) => {
          const column = worksheet.getColumn(index + 1);
          column.width = width;
        });

        [5, 6, 7].forEach((index) => {
          const column = worksheet.getColumn(index);
          column.numFmt = '#,##0.00';
          column.alignment = { horizontal: 'right' };
        });

        worksheet.getColumn(2).alignment = { horizontal: 'left' };
        worksheet.getColumn(3).alignment = { horizontal: 'left' };
        worksheet.getColumn(4).alignment = { horizontal: 'center' };
        worksheet.getColumn(8).alignment = { wrapText: true };

        const currencyTotalsEntries = Object.entries(reportData.summary?.totalsByCurrency ?? {});
        const totalsMap = currencyTotalsEntries.reduce(
          (acc, [currency, total]) => ({
            ...acc,
            [currency]: Number(total ?? 0)
          }),
          {}
        );

        const totalNio = (totalsMap.NIO ?? 0) + (totalsMap.USD ?? 0) * USD_TO_NIO_RATE;
        const totalUsd = (totalsMap.USD ?? 0) + (totalsMap.NIO ?? 0) / USD_TO_NIO_RATE;

        worksheet.addRow([]);
        const summaryHeader = worksheet.addRow(['Resumen', 'Valor']);
        summaryHeader.font = { bold: true, color: { argb: 'FF04182E' } };
        summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EEF8' } };
        summaryHeader.alignment = { vertical: 'middle' };
        summaryHeader.getCell(2).alignment = { horizontal: 'right' };

        const summaryRowsConfig = [
          {
            label: 'Movimientos',
            value: reportData.summary?.count ?? reportData.rows.length,
            format: '0'
          },
          ...currencyTotalsEntries.map(([currency, total]) => ({
            label: `Total ${currency}`,
            value: Number(total ?? 0),
            format: '#,##0.00'
          })),
          {
            label: 'Total equivalente en C$',
            value: totalNio,
            format: '#,##0.00',
            emphasis: true
          },
          {
            label: 'Total equivalente en USD',
            value: totalUsd,
            format: '#,##0.00',
            emphasis: true
          }
        ];

        summaryRowsConfig.forEach((item) => {
          const summaryRow = worksheet.addRow([item.label, item.value]);
          summaryRow.getCell(1).alignment = { horizontal: 'left' };
          summaryRow.getCell(2).alignment = { horizontal: 'right' };
          summaryRow.getCell(2).numFmt = item.format ?? '#,##0.00';
          if (item.emphasis) {
            summaryRow.font = { bold: true };
          }
        });

        const borderColor = 'FFD0D7E2';
        const summaryStart = summaryHeader.number;
        const summaryEnd = summaryStart + summaryRowsConfig.length;
        for (let rowIndex = summaryStart; rowIndex <= summaryEnd; rowIndex += 1) {
          ['A', 'B'].forEach((columnKey) => {
            const cell = worksheet.getCell(`${columnKey}${rowIndex}`);
            cell.border = {
              top: rowIndex === summaryStart ? { style: 'thin', color: { argb: borderColor } } : undefined,
              bottom: rowIndex === summaryEnd ? { style: 'thin', color: { argb: borderColor } } : undefined,
              left: { style: 'thin', color: { argb: borderColor } },
              right: { style: 'thin', color: { argb: borderColor } }
            };
          });
        }
      } else {
        const worksheet = workbook.addWorksheet(datasetLabel);
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        const tableRows = reportData.rows.map((row) => {
          const incomesNio = Number(row.incomes ?? 0);
          const expensesNio = Number(row.expenses ?? 0);
          const netNio = Number(row.net ?? 0);
          const carryNio = Number(row.carryOut ?? 0);

          return [
            row.label,
            incomesNio,
            incomesNio / USD_TO_NIO_RATE,
            expensesNio,
            expensesNio / USD_TO_NIO_RATE,
            netNio,
            netNio / USD_TO_NIO_RATE,
            carryNio,
            carryNio / USD_TO_NIO_RATE
          ];
        });

        const tableName = `Balance_${Date.now().toString(36)}`.slice(0, 30);
        worksheet.addTable({
          name: tableName,
          ref: 'A1',
          headerRow: true,
          style: { theme: 'TableStyleMedium4', showRowStripes: true },
          columns: [
            { name: 'Mes', filterButton: true },
            { name: 'Ingresos (C$)', filterButton: true },
            { name: 'Ingresos (USD)', filterButton: true },
            { name: 'Gastos (C$)', filterButton: true },
            { name: 'Gastos (USD)', filterButton: true },
            { name: 'Resultado (C$)', filterButton: true },
            { name: 'Resultado (USD)', filterButton: true },
            { name: 'Saldo acumulado (C$)', filterButton: true },
            { name: 'Saldo acumulado (USD)', filterButton: true }
          ],
          rows: tableRows
        });

        const widths = [20, 20, 20, 20, 20, 20, 20, 24, 24];
        widths.forEach((width, index) => {
          const column = worksheet.getColumn(index + 1);
          column.width = width;
          column.alignment = index === 0 ? { horizontal: 'left' } : { horizontal: 'right' };
          if (index > 0) {
            column.numFmt = '#,##0.00';
          }
        });

        const summary = reportData.summary ?? { incomes: { total: 0 }, expenses: { total: 0 }, balance: 0 };

        worksheet.addRow([]);
        const summaryHeader = worksheet.addRow(['Resumen', 'Valor']);
        summaryHeader.font = { bold: true, color: { argb: 'FF04182E' } };
        summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EEF8' } };
        summaryHeader.alignment = { vertical: 'middle' };
        summaryHeader.getCell(2).alignment = { horizontal: 'right' };

        const summaryRows = [
          ['Ingresos (C$)', summary.incomes?.total ?? 0],
          ['Ingresos (USD)', (summary.incomes?.total ?? 0) / USD_TO_NIO_RATE],
          ['Gastos (C$)', summary.expenses?.total ?? 0],
          ['Gastos (USD)', (summary.expenses?.total ?? 0) / USD_TO_NIO_RATE],
          ['Balance (C$)', summary.balance ?? 0],
          ['Balance (USD)', (summary.balance ?? 0) / USD_TO_NIO_RATE]
        ];

        summaryRows.forEach(([label, value], index) => {
          const row = worksheet.addRow([label, value]);
          row.getCell(1).alignment = { horizontal: 'left' };
          row.getCell(2).alignment = { horizontal: 'right' };
          row.getCell(2).numFmt = '#,##0.00';
          if (index >= summaryRows.length - 2) {
            row.font = { bold: true };
          }
        });

        const borderColor = 'FFD0D7E2';
        const summaryStart = summaryHeader.number;
        const summaryEnd = summaryStart + summaryRows.length;
        for (let rowIndex = summaryStart; rowIndex <= summaryEnd; rowIndex += 1) {
          ['A', 'B'].forEach((columnKey) => {
            const cell = worksheet.getCell(`${columnKey}${rowIndex}`);
            cell.border = {
              top: rowIndex === summaryStart ? { style: 'thin', color: { argb: borderColor } } : undefined,
              bottom: rowIndex === summaryEnd ? { style: 'thin', color: { argb: borderColor } } : undefined,
              left: { style: 'thin', color: { argb: borderColor } },
              right: { style: 'thin', color: { argb: borderColor } }
            };
          });
        }
      }

      await downloadWorkbook(workbook, `reporte-${appliedDataset}-${rangeSuffix}.xlsx`);
    } catch (exportError) {
      console.error('No se pudo exportar el Excel', exportError);
    }
  };

  const handleExportPdf = () => {
    if (!hasRows) {
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const title = `Reporte de ${datasetLabel}`;
    const subtitle = `Periodo: ${appliedFilters.from || 'sin inicio definido'} al ${appliedFilters.to || 'sin fin definido'}`;

    doc.setFontSize(16);
    doc.text(title, 40, 40);
    doc.setFontSize(11);
    doc.text(subtitle, 40, 60);

    if (appliedDataset === 'incomes' || appliedDataset === 'expenses') {
      const body = reportData.rows.map((row) => {
        const amount = Number(row.amount ?? 0);
        const currency = row.currency ?? 'NIO';
        const nioValue = currency === 'NIO' ? amount : amount * USD_TO_NIO_RATE;
        const usdValue = currency === 'USD' ? amount : amount / USD_TO_NIO_RATE;

        return [
          formatDate(row.date),
          row.category_name ?? 'Sin categoría',
          resolveOriginLabel(row),
          currency,
          numberFormatter.format(amount),
          numberFormatter.format(nioValue),
          numberFormatter.format(usdValue),
          row.note ?? ''
        ];
      });

      autoTable(doc, {
        head: [['Fecha', 'Categoría', 'Origen', 'Moneda', 'Monto original', 'Monto (C$)', 'Monto (USD)', 'Nota']],
        body,
        startY: 80,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [4, 24, 46], textColor: [255, 255, 255] }
      });

      const currencyTotalsEntries = Object.entries(reportData.summary?.totalsByCurrency ?? {});
      const totalsMap = currencyTotalsEntries.reduce(
        (acc, [currency, total]) => ({
          ...acc,
          [currency]: Number(total ?? 0)
        }),
        {}
      );

      const totalNio = (totalsMap.NIO ?? 0) + (totalsMap.USD ?? 0) * USD_TO_NIO_RATE;
      const totalUsd = (totalsMap.USD ?? 0) + (totalsMap.NIO ?? 0) / USD_TO_NIO_RATE;

      let currentY = (doc.lastAutoTable?.finalY ?? 80) + 18;
      doc.setFontSize(10);
      doc.text(`Movimientos: ${reportData.summary?.count ?? reportData.rows.length}`, 40, currentY);
      currentY += 14;

      currencyTotalsEntries.forEach(([currency, total]) => {
        doc.text(`Total ${currency}: ${formatCurrencyValue(total, currency)}`, 40, currentY);
        currentY += 14;
      });

      doc.text(`Total equivalente en C$: ${formatCurrencyValue(totalNio, 'NIO')}`, 40, currentY);
      currentY += 14;
      doc.text(`Total equivalente en USD: ${formatCurrencyValue(totalUsd, 'USD')}`, 40, currentY);
    } else {
      const body = reportData.rows.map((row) => {
        const incomesNio = Number(row.incomes ?? 0);
        const expensesNio = Number(row.expenses ?? 0);
        const netNio = Number(row.net ?? 0);
        const carryNio = Number(row.carryOut ?? 0);

        return [
          row.label,
          numberFormatter.format(incomesNio),
          numberFormatter.format(incomesNio / USD_TO_NIO_RATE),
          numberFormatter.format(expensesNio),
          numberFormatter.format(expensesNio / USD_TO_NIO_RATE),
          numberFormatter.format(netNio),
          numberFormatter.format(netNio / USD_TO_NIO_RATE),
          numberFormatter.format(carryNio),
          numberFormatter.format(carryNio / USD_TO_NIO_RATE)
        ];
      });

      autoTable(doc, {
        head: [
          [
            'Mes',
            'Ingresos (C$)',
            'Ingresos (USD)',
            'Gastos (C$)',
            'Gastos (USD)',
            'Resultado (C$)',
            'Resultado (USD)',
            'Saldo acumulado (C$)',
            'Saldo acumulado (USD)'
          ]
        ],
        body,
        startY: 80,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [4, 24, 46], textColor: [255, 255, 255] }
      });

      const summary = reportData.summary ?? { incomes: { total: 0 }, expenses: { total: 0 }, balance: 0 };
      const finalY = (doc.lastAutoTable?.finalY ?? 80) + 18;
      doc.setFontSize(10);
      doc.text(`Ingresos (C$): ${formatCurrencyValue(summary.incomes.total, 'NIO')}`, 40, finalY);
      doc.text(`Ingresos (USD): ${formatCurrencyValue(summary.incomes.total / USD_TO_NIO_RATE, 'USD')}`, 40, finalY + 14);
      doc.text(`Gastos (C$): ${formatCurrencyValue(summary.expenses.total, 'NIO')}`, 40, finalY + 28);
      doc.text(`Gastos (USD): ${formatCurrencyValue(summary.expenses.total / USD_TO_NIO_RATE, 'USD')}`, 40, finalY + 42);
      doc.text(`Balance (C$): ${formatCurrencyValue(summary.balance, 'NIO')}`, 40, finalY + 56);
      doc.text(`Balance (USD): ${formatCurrencyValue(summary.balance / USD_TO_NIO_RATE, 'USD')}`, 40, finalY + 70);
    }

    doc.save(`reporte-${appliedDataset}-${rangeSuffix}.pdf`);
  };

  const movementSummaryCards = useMemo(() => {
    if (!reportData.summary || (appliedDataset !== 'incomes' && appliedDataset !== 'expenses')) {
      return null;
    }

    const sortedTotals = Object.entries(reportData.summary.totalsByCurrency ?? {}).sort((a, b) => {
      if (a[0] === b[0]) return 0;
      if (a[0] === 'NIO') return -1;
      if (b[0] === 'NIO') return 1;
      return a[0] < b[0] ? -1 : 1;
    });

    return (
      <div className="reports-summary">
        <article className="reports-summary__item">
          <span className="reports-summary__label">Movimientos</span>
          <strong className="reports-summary__value">{reportData.summary.count}</strong>
        </article>
        {sortedTotals.map(([currency, total]) => {
          const amount = Number(total ?? 0);
          const hint =
            currency === 'USD'
              ? `Equivalente en C$: ${formatCurrencyValue(amount * USD_TO_NIO_RATE, 'NIO')}`
              : `Equivalente en USD: ${formatCurrencyValue(amount / USD_TO_NIO_RATE, 'USD')}`;

          return (
            <article key={currency} className="reports-summary__item">
              <span className="reports-summary__label">Total {currency}</span>
              <strong className="reports-summary__value">{formatCurrencyValue(amount, currency)}</strong>
              <small className="reports-summary__hint">{hint}</small>
            </article>
          );
        })}
      </div>
    );
  }, [reportData.summary, appliedDataset]);

  const balanceSummaryCards = useMemo(() => {
    if (!reportData.summary || appliedDataset !== 'balance') {
      return null;
    }

    const incomesNio = Number(reportData.summary.incomes.total ?? 0);
    const incomesBankNio = Number(reportData.summary.incomes.bank ?? 0);
    const incomesCashNio = Number(reportData.summary.incomes.cash ?? 0);
    const expensesNio = Number(reportData.summary.expenses.total ?? 0);
    const expensesBankNio = Number(reportData.summary.expenses.bank ?? 0);
    const expensesCashNio = Number(reportData.summary.expenses.cash ?? 0);
    const balanceNio = Number(reportData.summary.balance ?? 0);

    const incomesUsd = incomesNio / USD_TO_NIO_RATE;
    const incomesBankUsd = incomesBankNio / USD_TO_NIO_RATE;
    const incomesCashUsd = incomesCashNio / USD_TO_NIO_RATE;
    const expensesUsd = expensesNio / USD_TO_NIO_RATE;
    const expensesBankUsd = expensesBankNio / USD_TO_NIO_RATE;
    const expensesCashUsd = expensesCashNio / USD_TO_NIO_RATE;
    const balanceUsd = balanceNio / USD_TO_NIO_RATE;

    return (
      <div className="reports-summary">
        <article className="reports-summary__item">
          <span className="reports-summary__label">Ingresos</span>
          <strong className="reports-summary__value">{formatCurrencyValue(incomesNio, 'NIO')}</strong>
          <small className="reports-summary__hint">
            ≈ {formatCurrencyValue(incomesUsd, 'USD')} · Banco: {formatCurrencyValue(incomesBankNio, 'NIO')} (≈ {formatCurrencyValue(incomesBankUsd, 'USD')}) · Efectivo: {formatCurrencyValue(incomesCashNio, 'NIO')} (≈ {formatCurrencyValue(incomesCashUsd, 'USD')})
          </small>
        </article>
        <article className="reports-summary__item">
          <span className="reports-summary__label">Gastos</span>
          <strong className="reports-summary__value">{formatCurrencyValue(expensesNio, 'NIO')}</strong>
          <small className="reports-summary__hint">
            ≈ {formatCurrencyValue(expensesUsd, 'USD')} · Banco: {formatCurrencyValue(expensesBankNio, 'NIO')} (≈ {formatCurrencyValue(expensesBankUsd, 'USD')}) · Efectivo: {formatCurrencyValue(expensesCashNio, 'NIO')} (≈ {formatCurrencyValue(expensesCashUsd, 'USD')})
          </small>
        </article>
        <article className="reports-summary__item">
          <span className="reports-summary__label">Balance</span>
          <strong className={`reports-summary__value ${balanceNio >= 0 ? 'is-positive' : 'is-negative'}`}>
            {formatCurrencyValue(balanceNio, 'NIO')}
          </strong>
          <small className="reports-summary__hint">≈ {formatCurrencyValue(balanceUsd, 'USD')}</small>
        </article>
      </div>
    );
  }, [reportData.summary, appliedDataset]);

  const balanceAccountsSection = useMemo(() => {
    if (appliedDataset !== 'balance') {
      return null;
    }

    const accounts = Array.isArray(reportData.accounts) ? reportData.accounts : [];
    if (accounts.length === 0) {
      return null;
    }

    return (
      <section className="reports-accounts">
        <header className="reports-accounts__intro">
          <h2>Cuentas bancarias</h2>
          <p>Detalle de ingresos, gastos y saldo por cuenta para el rango seleccionado.</p>
        </header>
        <div className="reports-accounts__grid">
          {accounts.map((entry, index) => {
            const key = entry.accountId ?? entry.account?.id ?? `account-${index}`;
            const label = formatAccountName(entry.account) || 'Cuenta bancaria';
            const institution = entry.account?.bank_institution === 'Otro'
              ? entry.account?.institution_name ?? 'Otro'
              : entry.account?.bank_institution ?? null;
            const currency = entry.account?.currency ?? 'NIO';

            const incomesNio = Number(entry.incomes?.nio ?? 0);
            const incomesUsd = Number(entry.incomes?.usd ?? incomesNio / USD_TO_NIO_RATE);
            const expensesNio = Number(entry.expenses?.nio ?? 0);
            const expensesUsd = Number(entry.expenses?.usd ?? expensesNio / USD_TO_NIO_RATE);
            const netNio = Number(entry.net?.nio ?? incomesNio - expensesNio);
            const netUsd = Number(entry.net?.usd ?? netNio / USD_TO_NIO_RATE);
            const netClass = netNio >= 0 ? 'is-positive' : 'is-negative';

            return (
              <article key={key} className="reports-accounts__item">
                <header className="reports-accounts__header">
                  <div>
                    <h3>{label}</h3>
                    {institution ? <span className="reports-accounts__institution">{institution}</span> : null}
                  </div>
                  <span className="reports-accounts__currency">{currency}</span>
                </header>
                <dl className="reports-accounts__totals">
                  <div>
                    <dt>Ingresos</dt>
                    <dd>
                      {formatCurrencyValue(incomesNio, 'NIO')}
                      <small>≈ {formatCurrencyValue(incomesUsd, 'USD')}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Gastos</dt>
                    <dd>
                      {formatCurrencyValue(expensesNio, 'NIO')}
                      <small>≈ {formatCurrencyValue(expensesUsd, 'USD')}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Saldo</dt>
                    <dd className={netClass}>
                      {formatCurrencyValue(netNio, 'NIO')}
                      <small>≈ {formatCurrencyValue(netUsd, 'USD')}</small>
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
    );
  }, [appliedDataset, reportData.accounts]);

  return (
    <section className="reports">
      <header className="reports__header">
        <div>
          <h1>Reportes</h1>
          <p>Genera informes detallados de ingresos, gastos o del balance general y expórtalos en Excel o PDF según el periodo que necesites.</p>
        </div>
      </header>

      <article className="reports-card">
        <form className="reports-filters" onSubmit={handleSubmit}>
          <div className="reports-datasets">
            {DATASETS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`reports-datasets__item${dataset === option.value ? ' is-active' : ''}`}
                onClick={() => handleDatasetChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="reports-fields">
            <label className="reports-field">
              <span>Desde</span>
              <input
                type="date"
                name="from"
                value={filters.from}
                onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
                className="reports-input"
              />
            </label>
            <label className="reports-field">
              <span>Hasta</span>
              <input
                type="date"
                name="to"
                value={filters.to}
                onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
                className="reports-input"
              />
            </label>
            <label className="reports-field">
              <span>Mes rápido</span>
              <select
                value={selectedPreset}
                onChange={(event) => handlePresetSelect(event.target.value)}
                className="reports-input"
              >
                <option value="custom">Selecciona un mes</option>
                {monthPresets.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="reports-actions">
            <button type="submit" className="reports-button reports-button--primary" disabled={loading}>
              {loading ? 'Generando...' : 'Actualizar'}
            </button>
            <button type="button" className="reports-button" onClick={handleExportExcel} disabled={!hasRows || loading}>
              Exportar Excel
            </button>
            <button type="button" className="reports-button" onClick={handleExportPdf} disabled={!hasRows || loading}>
              Exportar PDF
            </button>
          </div>
        </form>

        {error ? <p className="reports-error">{error}</p> : null}

        {loading ? (
          <p className="reports-loading">Generando reporte...</p>
        ) : !hasRows ? (
          <p className="reports-empty">No encontramos registros para los filtros seleccionados. Ajusta el rango de fechas e intenta nuevamente.</p>
        ) : (
          <>
            {movementSummaryCards}
            {balanceSummaryCards}
            {balanceAccountsSection}

            {appliedDataset !== 'balance' && reportData.monthly.length > 0 ? (
              <section className="reports-monthly">
                <header>
                  <h2>Totales por mes</h2>
                  <p>Visualiza los movimientos agrupados por mes. Mostramos los últimos registros disponibles.</p>
                </header>
                <div className="reports-monthly__grid">
                  {reportData.monthly.slice(0, 6).map((month) => (
                    <article key={month.month} className="reports-monthly__item">
                      <h3>{month.label}</h3>
                      <p className="reports-monthly__count">
                        {month.count} {month.count === 1 ? 'movimiento' : 'movimientos'}
                      </p>
                      <ul>
                        {Object.entries(month.totalsByCurrency)
                          .sort((a, b) => {
                            if (a[0] === b[0]) return 0;
                            if (a[0] === 'NIO') return -1;
                            if (b[0] === 'NIO') return 1;
                            return a[0] < b[0] ? -1 : 1;
                          })
                          .map(([currency, total]) => {
                            const amount = Number(total ?? 0);
                            const hint =
                              currency === 'USD'
                                ? `Equivalente en C$: ${formatCurrencyValue(amount * USD_TO_NIO_RATE, 'NIO')}`
                                : `Equivalente en USD: ${formatCurrencyValue(amount / USD_TO_NIO_RATE, 'USD')}`;

                            return (
                              <li key={currency}>
                                {currency}: {formatCurrencyValue(amount, currency)} ({hint})
                              </li>
                            );
                          })}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="reports-table__wrapper">
              <table className="reports-table">
                <thead>
                  {appliedDataset === 'balance' ? (
                    <tr>
                      <th>Mes</th>
                      <th>Ingresos (C$)</th>
                      <th>Gastos (C$)</th>
                      <th>Resultado (C$)</th>
                      <th>Saldo acumulado (C$)</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>Fecha</th>
                      <th>Categoría</th>
                      <th>Monto</th>
                      <th>Origen</th>
                      <th>Nota</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {appliedDataset === 'balance'
                    ? reportData.rows.map((row) => (
                        <tr key={row.month}>
                          <td>{row.label}</td>
                          <td>
                            <div className="reports-table__amount">
                              <span>{formatCurrencyValue(row.incomes, 'NIO')}</span>
                              <span className="reports-table__amount-secondary">≈ {formatCurrencyValue(row.incomes / USD_TO_NIO_RATE, 'USD')}</span>
                            </div>
                          </td>
                          <td>
                            <div className="reports-table__amount">
                              <span>{formatCurrencyValue(row.expenses, 'NIO')}</span>
                              <span className="reports-table__amount-secondary">≈ {formatCurrencyValue(row.expenses / USD_TO_NIO_RATE, 'USD')}</span>
                            </div>
                          </td>
                          <td className={row.net >= 0 ? 'is-positive' : 'is-negative'}>
                            <div className="reports-table__amount">
                              <span>{formatCurrencyValue(row.net, 'NIO')}</span>
                              <span className="reports-table__amount-secondary">≈ {formatCurrencyValue(row.net / USD_TO_NIO_RATE, 'USD')}</span>
                            </div>
                          </td>
                          <td className={row.carryOut >= 0 ? 'is-positive' : 'is-negative'}>
                            <div className="reports-table__amount">
                              <span>{formatCurrencyValue(row.carryOut, 'NIO')}</span>
                              <span className="reports-table__amount-secondary">≈ {formatCurrencyValue(row.carryOut / USD_TO_NIO_RATE, 'USD')}</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    : reportData.rows.map((row, index) => (
                        <tr key={row.id ?? `${row.date}-${index}`}>
                          <td>{formatDate(row.date)}</td>
                          <td>{row.category_name ?? 'Sin categoría'}</td>
                          <td>{formatCurrencyValue(row.amount, row.currency ?? 'NIO')}</td>
                          <td>{resolveOriginLabel(row)}</td>
                          <td>{row.note ?? '-'}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>
    </section>
  );
}

export default ReportsPage;
