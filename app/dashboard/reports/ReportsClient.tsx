'use client';

import * as React from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useLocale } from '@/lib/i18n/client';

type ReportPeriod = 'daily' | 'monthly' | 'category' | 'cashflow';
type ReportRow = Record<string, unknown>;

type Summary = {
  income: number;
  expense: number;
  transfer: number;
  net: number;
  savingRate: number;
};

const PERIODS: Array<{ value: ReportPeriod; labelKey: string }> = [
  { value: 'daily', labelKey: 'report.daily' },
  { value: 'monthly', labelKey: 'report.monthly' },
  { value: 'category', labelKey: 'report.category' },
  { value: 'cashflow', labelKey: 'report.cashflow' },
];

export default function ReportsClient() {
  const { t } = useLocale();
  const [period, setPeriod] = React.useState<ReportPeriod>('monthly');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [categoryRows, setCategoryRows] = React.useState<ReportRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [mainRows, categories] = await Promise.all([
        fetchRows(period, from, to),
        period === 'category' ? Promise.resolve([]) : fetchRows('category', from, to),
      ]);
      setRows(mainRows);
      setCategoryRows(period === 'category' ? mainRows : categories);
    } catch {
      setRows([]);
      setCategoryRows([]);
      setError(t('report.error'));
    } finally {
      setLoading(false);
    }
  }, [from, period, t, to]);

  React.useEffect(() => { void load(); }, [load]);

  function exportCsv() {
    const requestUrl = new URL('/api/reports/export', window.location.origin);
    requestUrl.searchParams.set('period', period);
    requestUrl.searchParams.set('format', 'csv');
    if (from) requestUrl.searchParams.set('from', from);
    if (to) requestUrl.searchParams.set('to', to);
    window.open(requestUrl.pathname + requestUrl.search, '_blank', 'noopener,noreferrer');
  }

  const allSummary = summarise(rows);
  const latestRow = rows.at(-1);
  const previousRow = rows.at(-2);
  const summary = period === 'monthly' && latestRow ? summarise([latestRow]) : allSummary;
  const previousSummary = previousRow ? summarise([previousRow]) : null;
  const netDelta = previousSummary ? summary.net - previousSummary.net : null;
  const trendRows = period === 'category' ? [] : rows.slice(-12);
  const expenseCategories = categoryRows
    .filter((row) => String(row.type ?? '').toLowerCase() === 'expense')
    .sort((a, b) => readNumber(b.amount) - readNumber(a.amount))
    .slice(0, 5);
  const categoryTotal = expenseCategories.reduce((total, row) => total + readNumber(row.amount), 0);
  const categoryMax = Math.max(...expenseCategories.map((row) => readNumber(row.amount)), 1);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">{t('report.eyebrow')}</p>
          <h1 className="mt-2 font-heading text-4xl font-medium tracking-[-0.04em] sm:text-5xl">{t('nav.reports')}</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t('report.subtitle')}</p>
        </div>
        <button type="button" onClick={exportCsv} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold transition hover:border-primary hover:text-primary">
          <Download className="h-4 w-4" aria-hidden />
          {t('report.exportCsv')}
        </button>
      </div>

      <div className="rounded-[28px] border border-border bg-surface p-3 shadow-card">
        <div role="tablist" aria-label={t('report.periodLabel')} className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PERIODS.map((item) => {
            const active = item.value === period;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPeriod(item.value)}
                className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold transition ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'}`}
              >
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid gap-3 border-t border-border/70 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
            {t('report.from')}
            <input aria-label={t('report.from')} type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20" />
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
            {t('report.to')}
            <input aria-label={t('report.to')} type="date" value={to} onChange={(event) => setTo(event.target.value)} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20" />
          </label>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-70">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            {t('report.refresh')}
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">{error}</div>}

      <section aria-labelledby="report-summary-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="report-summary-heading" className="font-heading text-2xl font-medium">{t('report.summary')}</h2>
          {loading && <span className="text-xs text-muted-foreground" aria-live="polite">{t('report.loading')}</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label={t('report.netCashflow')} value={formatMoney(summary.net)} tone={summary.net >= 0 ? 'income' : 'expense'} detail={formatDelta(netDelta, t('report.vsPrevious'))} />
          <SummaryCard label={t('report.income')} value={formatMoney(summary.income)} tone="income" detail={formatDelta(previousSummary ? summary.income - previousSummary.income : null, t('report.vsPrevious'))} />
          <SummaryCard label={t('report.expense')} value={formatMoney(summary.expense)} tone="expense" detail={formatDelta(previousSummary ? summary.expense - previousSummary.expense : null, t('report.vsPrevious'))} />
          <SummaryCard label={t('report.savingRate')} value={`${summary.savingRate.toFixed(1)}%`} tone="neutral" detail={summary.income ? t('report.income') : t('report.empty')} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <section className="rounded-[28px] border border-border bg-surface p-5 shadow-card sm:p-6" aria-labelledby="cashflow-heading">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="cashflow-heading" className="font-heading text-2xl font-medium">{t('report.cashflowTitle')}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t('report.income')} · {t('report.expense')}</p>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">{t(`report.${period}`)}</span>
          </div>
          {trendRows.length ? (
            <>
              <div className="mt-6 h-56 rounded-2xl bg-background p-3 sm:p-4">
                <svg viewBox="0 0 700 220" preserveAspectRatio="none" role="img" aria-label={t('report.cashflowChart')} className="h-full w-full overflow-hidden">
                  <path d="M0 55H700 M0 110H700 M0 165H700" stroke="var(--color-border)" strokeWidth="1" strokeDasharray="4 7" />
                  <polyline points={buildPoints(trendRows, 'income')} fill="none" stroke="var(--color-income)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={buildPoints(trendRows, 'expense')} fill="none" stroke="var(--color-chart-expense)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 6" />
                </svg>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-income" aria-hidden />{t('report.incomeLine')}</span>
                <span className="inline-flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[var(--color-chart-expense)]" aria-hidden />{t('report.expenseLine')}</span>
                <span>{formatPeriodLabel(String(trendRows[0]?.month ?? trendRows[0]?.date ?? ''), period)} → {formatPeriodLabel(String(trendRows.at(-1)?.month ?? trendRows.at(-1)?.date ?? ''), period)}</span>
              </div>
            </>
          ) : <EmptyState loading={loading} label={t('report.empty')} />}
        </section>

        <section className="rounded-[28px] border border-border bg-secondary p-5 sm:p-6" aria-labelledby="category-heading">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">{t('report.category')}</p>
          <h2 id="category-heading" className="mt-2 font-heading text-2xl font-medium">{t('report.topCategories')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('report.categoryShare')}</p>
          {expenseCategories.length ? (
            <div className="mt-6 grid gap-5">
              {expenseCategories.map((row) => {
                const amount = readNumber(row.amount);
                const share = categoryTotal ? Math.round((amount / categoryTotal) * 100) : 0;
                return (
                  <div key={String(row.categoryId ?? row.name)}>
                    <div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-bold">{String(row.name ?? '')}</span><span className="shrink-0 text-muted-foreground">{share}%</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-background"><i className="block h-full rounded-full bg-primary" style={{ width: `${Math.max((amount / categoryMax) * 100, 4)}%` }} /></div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatMoney(amount)} · {String(row.count ?? 0)} {t('report.count')}</p>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState loading={loading} label={t('report.noCategories')} />}
        </section>
      </div>

      <section className="rounded-[28px] border border-border bg-surface p-5 shadow-card sm:p-6" aria-labelledby="comparison-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="comparison-heading" className="font-heading text-2xl font-medium">{period === 'category' ? t('report.category') : t('report.comparison')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('report.dateRange')}</p>
          </div>
          {loading && <span className="text-xs text-muted-foreground">{t('report.loading')}</span>}
        </div>
        <div className="mt-5 overflow-x-auto">
          {period === 'category' ? <CategoryTable rows={rows} t={t} /> : <ReportTable period={period} rows={rows} t={t} />}
        </div>
      </section>
    </section>
  );
}

function SummaryCard({ label, value, tone, detail }: { label: string; value: string; tone: 'income' | 'expense' | 'neutral'; detail: string }) {
  const valueClass = tone === 'income' ? 'text-income' : tone === 'expense' ? 'text-expense' : 'text-foreground';
  return <article className="rounded-2xl border border-border bg-surface p-4 shadow-card"><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className={`mt-3 font-heading text-2xl font-semibold tracking-[-0.03em] ${valueClass}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>;
}

function EmptyState({ loading, label }: { loading: boolean; label: string }) {
  return <div className="mt-6 grid min-h-32 place-items-center rounded-2xl bg-background px-4 text-center text-sm text-muted-foreground" aria-live="polite">{loading ? '…' : label}</div>;
}

function ReportTable({ period, rows, t }: { period: ReportPeriod; rows: ReportRow[]; t: (key: string, fallback?: string) => string }) {
  const visibleRows = rows.slice(-12);
  if (!visibleRows.length) return <EmptyState loading={false} label={t('report.empty')} />;
  const labelKey = period === 'monthly' ? 'report.month' : 'report.date';
  const field = period === 'monthly' ? 'month' : 'date';
  return <table className="w-full min-w-[620px] text-sm"><thead className="border-b border-border text-left text-xs uppercase tracking-[0.1em] text-muted-foreground"><tr><th scope="col" className="px-3 py-3">{t(labelKey)}</th><th scope="col" className="px-3 py-3 text-right">{t('report.income')}</th><th scope="col" className="px-3 py-3 text-right">{t('report.expense')}</th><th scope="col" className="px-3 py-3 text-right">{t('report.net')}</th></tr></thead><tbody className="divide-y divide-border">{visibleRows.map((row, index) => { const income = readNumber(row.income); const expense = readNumber(row.expense); return <tr key={`${String(row[field] ?? index)}-${index}`}><th scope="row" className="px-3 py-3 text-left font-bold">{formatPeriodLabel(String(row[field] ?? ''), period)}</th><td className="px-3 py-3 text-right text-income">{formatMoney(income)}</td><td className="px-3 py-3 text-right text-expense">{formatMoney(expense)}</td><td className={`px-3 py-3 text-right font-bold ${income - expense >= 0 ? 'text-income' : 'text-expense'}`}>{formatMoney(income - expense)}</td></tr>; })}</tbody></table>;
}

function CategoryTable({ rows, t }: { rows: ReportRow[]; t: (key: string, fallback?: string) => string }) {
  if (!rows.length) return <EmptyState loading={false} label={t('report.empty')} />;
  return <table className="w-full min-w-[560px] text-sm"><thead className="border-b border-border text-left text-xs uppercase tracking-[0.1em] text-muted-foreground"><tr><th scope="col" className="px-3 py-3">{t('report.category')}</th><th scope="col" className="px-3 py-3">{t('report.type')}</th><th scope="col" className="px-3 py-3 text-right">{t('report.amount')}</th><th scope="col" className="px-3 py-3 text-right">{t('report.count')}</th></tr></thead><tbody className="divide-y divide-border">{rows.map((row, index) => <tr key={`${String(row.categoryId ?? row.name)}-${index}`}><th scope="row" className="px-3 py-3 text-left font-bold">{String(row.name ?? '')}</th><td className="px-3 py-3 text-muted-foreground">{typeLabel(String(row.type ?? ''), t)}</td><td className="px-3 py-3 text-right">{formatMoney(readNumber(row.amount))}</td><td className="px-3 py-3 text-right text-muted-foreground">{String(row.count ?? 0)}</td></tr>)}</tbody></table>;
}

async function fetchRows(period: ReportPeriod, from: string, to: string): Promise<ReportRow[]> {
  const requestUrl = new URL('/api/reports', window.location.origin);
  requestUrl.searchParams.set('period', period);
  if (from) requestUrl.searchParams.set('from', from);
  if (to) requestUrl.searchParams.set('to', to);
  const response = await fetch(requestUrl.pathname + requestUrl.search, { cache: 'no-store' });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error('reports_request_failed');
  return Array.isArray(json.data?.rows) ? json.data.rows as ReportRow[] : [];
}

function summarise(rows: ReportRow[]): Summary {
  const income = rows.reduce((total, row) => total + readNumber(row.income), 0);
  const expense = rows.reduce((total, row) => total + readNumber(row.expense), 0);
  const transfer = rows.reduce((total, row) => total + readNumber(row.transfer), 0);
  const net = income - expense;
  return { income, expense, transfer, net, savingRate: income > 0 ? Math.max(0, (net / income) * 100) : 0 };
}

function buildPoints(rows: ReportRow[], key: string) {
  const values = rows.map((row) => readNumber(row[key]));
  const max = Math.max(...values, 1);
  const chartPadding = 12;
  return values.map((value, index) => `${chartPadding + (index / Math.max(values.length - 1, 1)) * (700 - chartPadding * 2)},${205 - (value / max) * 175}`).join(' ');
}

function readNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}

function formatPeriodLabel(value: string, period: ReportPeriod) {
  if (!value) return '—';
  if (period === 'monthly' && /^\d{4}-\d{2}$/.test(value)) return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(new Date(`${value}-01T00:00:00`));
  if ((period === 'daily' || period === 'cashflow') && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`));
  return value;
}

function formatDelta(delta: number | null, label: string) {
  if (delta === null) return label;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${formatMoney(delta)} ${label}`;
}

function typeLabel(type: string, t: (key: string, fallback?: string) => string) {
  if (type === 'income') return t('report.income');
  if (type === 'expense') return t('report.expense');
  if (type === 'adjustment') return t('report.adjustment');
  return type || '—';
}
