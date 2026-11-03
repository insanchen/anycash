import { cookies } from 'next/headers';
import { getLocale } from '@/lib/i18n/get-locale';
import { t } from '@/lib/i18n';
import { desc, eq, inArray } from 'drizzle-orm';
import { DashboardShell } from '@/components/layouts/DashboardShell';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db';
import { accounts, accountMembers, transactions, userAccountOrder } from '@/lib/db/schema';
import AccountCarousel from '@/components/dashboard/AccountCarousel';

export const dynamic = 'force-dynamic';

type DashboardData = {
  totalBalance: number;
  totalDebt: number;
  accountCount: number;
  transactionCount: number;
  accountRows: Array<typeof accounts.$inferSelect>;
  transactionRows: Array<typeof transactions.$inferSelect>;
  chartRows: Array<typeof transactions.$inferSelect>;
};

function formatMoney(value: number, currency = 'IDR') {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(value));
}

async function getDashboardData(): Promise<DashboardData | null> {
  const cookieStore = await cookies();
  const access = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!access) return null;

  let userId: string;
  try { userId = verifyAccessToken(access).sub; } catch { return null; }

  const ownedAccounts = await db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(accounts.createdAt);
  const memberships = await db.select({ accountId: accountMembers.accountId })
    .from(accountMembers).where(eq(accountMembers.userId, userId));
  const ownedIds = new Set(ownedAccounts.map((account) => account.id));
  const sharedIds = memberships.map((membership) => membership.accountId).filter((id) => !ownedIds.has(id));
  const sharedAccounts = sharedIds.length
    ? await db.select().from(accounts).where(inArray(accounts.id, sharedIds)).orderBy(accounts.createdAt)
    : [];
  const accountRows = [...ownedAccounts, ...sharedAccounts];
  const orderRows = await db.select().from(userAccountOrder).where(eq(userAccountOrder.userId, userId));
  const positionById = new Map(orderRows.map((row) => [row.accountId, row.position]));
  accountRows.sort((a, b) => (positionById.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positionById.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  const chartRows = await db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.date)).limit(30);
  const transactionRows = chartRows.slice(0, 5);
  const totalBalance = accountRows
    .filter((account) => account.type !== 'credit_card')
    .reduce((sum, account) => sum + Number(account.balance ?? 0), 0);
  const totalDebt = accountRows
    .filter((account) => account.type === 'credit_card')
    .reduce((sum, account) => sum + Math.max(0, -Number(account.balance ?? 0)), 0);

  return { totalBalance, totalDebt, accountCount: accountRows.length, transactionCount: transactionRows.length, accountRows, transactionRows, chartRows };
}

export default async function DashboardHomePage() {
  const locale = await getLocale();
  const data = await getDashboardData();
  const chartRows = [...(data?.chartRows ?? [])].reverse();
  const maxAmount = Math.max(...chartRows.map((transaction) => Math.abs(Number(transaction.amount))), 1);

  return (
    <DashboardShell>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-primary">{t(locale, 'dash.eyebrow')}</p>
        <h1 className="font-heading text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{t(locale, 'dash.greeting')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t(locale, 'dash.intro')}</p>
      </div>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <div className="relative overflow-hidden rounded-[28px] bg-primary-dark p-6 text-primary-foreground shadow-card sm:p-8">
          <div className="relative z-10">
            <p className="text-sm text-primary-foreground/70">{t(locale, 'dash.totalBalance')}</p>
            <p className="mt-3 font-heading text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{formatMoney(data?.totalBalance ?? 0)}</p>
            <div className="mt-6 border-t border-primary-foreground/15 pt-4">
              <p className="text-sm text-primary-foreground/70">{t(locale, 'dash.totalDebt')}</p>
              <p className="mt-1 font-heading text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{formatMoney(data?.totalDebt ?? 0)}</p>
              <p className="mt-1 text-xs text-primary-foreground/60">{t(locale, 'dash.totalDebtDetail')}</p>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              <a href="/dashboard/transactions" className="rounded-full bg-primary-foreground px-4 py-2 text-xs font-extrabold text-primary-dark transition hover:bg-sage-highlight">{t(locale, 'dash.quickAdd')}</a>
              <a href="/dashboard/reports" className="rounded-full border border-primary-foreground/30 px-4 py-2 text-xs font-extrabold text-primary-foreground transition hover:bg-primary-foreground/10">{t(locale, 'dash.viewReports')}</a>
            </div>
          </div>
          <div className="pointer-events-none absolute -bottom-24 -right-10 h-64 w-64 rounded-full border border-primary-foreground/20" />
          <div className="pointer-events-none absolute -bottom-12 -right-[-56px] h-40 w-40 rounded-full border border-primary-foreground/15" />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <MetricCard label={t(locale, 'dash.accountCount')} value={String(data?.accountCount ?? 0)} detail={t(locale, 'dash.accountCountDetail')} />
          <MetricCard label={t(locale, 'dash.recentTxn')} value={String(data?.transactionCount ?? 0)} detail={t(locale, 'dash.recentTxnDetail')} />
          <MetricCard label={t(locale, 'dash.period')} value={t(locale, 'dash.thisMonth')} detail={t(locale, 'dash.periodDetail')} />
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-[28px] border border-border bg-surface p-5 shadow-card sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">{t(locale, 'dash.cashflow')}</p><h2 className="mt-2 font-heading text-2xl font-semibold">{t(locale, 'dash.cashflowTitle')}</h2></div>
            <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-bold text-secondary-foreground">{t(locale, 'dash.lastActivity')}</span>
          </div>
          {chartRows.length ? (
            <div className="mt-7">
              <svg viewBox="0 0 640 180" className="h-44 w-full" role="img" aria-label={t(locale, 'dash.cashflow')}>
                <path d="M0 146H640M0 92H640M0 38H640" stroke="var(--color-border)" strokeDasharray="4 8" strokeWidth="1" />
                <polyline fill="none" stroke="var(--color-income)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" points={chartRows.map((transaction, index) => `${20 + index * (600 / Math.max(chartRows.length - 1, 1))},${150 - (Math.abs(Number(transaction.amount)) / maxAmount) * 112}`).join(' ')} />
                {chartRows.map((transaction, index) => <circle key={transaction.id} cx={20 + index * (600 / Math.max(chartRows.length - 1, 1))} cy={150 - (Math.abs(Number(transaction.amount)) / maxAmount) * 112} r="5" fill="var(--color-surface)" stroke="var(--color-income)" strokeWidth="3" />)}
              </svg>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground"><span>{formatDate(chartRows[0].date)}</span><span>{t(locale, 'dash.tapReports')}</span><span>{formatDate(chartRows.at(-1)!.date)}</span></div>
            </div>
          ) : <div className="mt-7 rounded-2xl bg-background px-4 py-10 text-center text-sm text-muted-foreground">{t(locale, 'dash.noTransactions')}</div>}
        </div>

        <AccountCarousel
          accounts={(data?.accountRows ?? []).map((account) => ({ ...account, balance: Number(account.balance ?? 0), creditLimit: account.creditLimit == null ? null : Number(account.creditLimit) }))}
          title={t(locale, 'nav.accounts')}
          seeAll={t(locale, 'dash.seeAll')}
          previous={t(locale, 'dash.previousAccount')}
          next={t(locale, 'dash.nextAccount')}
          labels={{ personal: t(locale, 'account.personal'), joint: t(locale, 'account.joint'), creditCard: t(locale, 'account.creditCard'), debt: t(locale, 'dash.cardDebt'), available: t(locale, 'account.available') }}
        />
      </section>

      <section className="mt-5 rounded-[28px] border border-border bg-surface p-5 shadow-card sm:p-7">
        <div className="flex items-center justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">{t(locale, 'dash.recentActivity')}</p><h2 className="mt-2 font-heading text-2xl font-semibold">{t(locale, 'dash.recentTitle')}</h2></div><a href="/dashboard/transactions" className="text-xs font-bold text-primary-dark hover:underline">{t(locale, 'dash.seeAll')}</a></div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {data?.transactionRows.length ? data.transactionRows.map((transaction) => { const expense = transaction.type === 'expense' || Number(transaction.amount) < 0; return <div key={transaction.id} className="flex items-center justify-between rounded-2xl bg-background px-4 py-3"><div><p className="font-bold capitalize text-foreground">{transaction.note || transaction.type}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(transaction.date)} · {transaction.type}</p></div><p className={`text-sm font-extrabold ${expense ? 'text-expense' : 'text-income'}`}>{expense ? '−' : '+'}{formatMoney(Math.abs(Number(transaction.amount)))}</p></div>; }) : <p className="rounded-2xl bg-background p-4 text-sm text-muted-foreground">{t(locale, 'dash.noTransactions')}</p>}
        </div>
      </section>
    </DashboardShell>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-[22px] border border-border bg-surface p-5 shadow-card"><p className="text-xs font-bold text-muted-foreground">{label}</p><p className="mt-2 font-heading text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}
