import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transactions, categories } from '@/lib/db/schema';
import { eq, and, sql, gte, lt, SQL } from 'drizzle-orm';
import { authenticateRequest } from '@/lib/auth/auth';
import { rateLimit } from '@/lib/auth/rate-limit';
import { BUSINESS_TIME_ZONE, businessDateString, instantFromWallClock, zonedClock } from '@/lib/transactions/datetime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Period = 'daily' | 'monthly' | 'category' | 'cashflow';

function parsePeriod(raw: string | null): Period | null {
  const p = String(raw ?? '').toLowerCase().trim();
  if (p === 'daily' || p === 'monthly' || p === 'category' || p === 'cashflow') return p;
  return null;
}

function parseDateParam(raw: string | null): Date | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function accessibleAccountIds(userId: string) {
  const { db } = await import('@/lib/db');
  const { accounts, accountMembers } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const owned = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, userId));
  const memberRows = await db.select({ accountId: accountMembers.accountId }).from(accountMembers).where(eq(accountMembers.userId, userId));
  const ids = new Set<string>();
  for (const row of owned) ids.add(row.id);
  for (const row of memberRows) ids.add(row.accountId);
  return Array.from(ids);
}

function escapeCsv(value: string) {
  const s = String(value ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Exports use the same business-day rules as /api/reports, so the CSV matches what the UI shows.
// The timezone is a literal here for the same reason as there: a bind parameter in SELECT would
// not match the one in GROUP BY, and Postgres rejects the query.
const timeZoneLiteral = sql.raw(`'${BUSINESS_TIME_ZONE}'`);
const localTimestamp = sql`(${transactions.date} AT TIME ZONE ${timeZoneLiteral})`;
const localDay = sql`date_trunc('day', ${localTimestamp})`;
const localDayText = sql<string>`to_char(date_trunc('day', ${localTimestamp}), 'YYYY-MM-DD')`;
const localMonth = sql`date_trunc('month', ${localTimestamp})`;
const localMonthText = sql<string>`to_char(date_trunc('month', ${localTimestamp}), 'YYYY-MM')`;

function businessDayStart(date: Date, dayShift = 0) {
  const clock = zonedClock(date, BUSINESS_TIME_ZONE);
  return instantFromWallClock(
    { year: clock.year, month: clock.month, day: clock.day + dayShift, hour: 0, minute: 0, second: 0 },
    BUSINESS_TIME_ZONE,
  );
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'transactions:read');
  if (!auth) return NextResponse.json({ success: false, error: 'Not authenticated', field: 'auth' }, { status: 401 });
  if (!(await rateLimit({ key: `reports:export:${auth.userId}`, limit: 20, windowMs: 60_000 }))) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded', field: 'rate_limit' }, { status: 429 });
  }

  const url = new URL(request.url);
  const format = String(url.searchParams.get('format') ?? '').toLowerCase().trim();
  const period = parsePeriod(url.searchParams.get('period'));
  if (format !== 'csv') return NextResponse.json({ success: false, error: "format=csv required", field: 'format' }, { status: 400 });
  if (!period) return NextResponse.json({ success: false, error: "period is required: daily|monthly|category|cashflow", field: 'period' }, { status: 400 });

  const to = parseDateParam(url.searchParams.get('to'));
  const toExclusive = businessDayStart(to ?? new Date(), 1);
  const accountIds = await accessibleAccountIds(auth.userId);
  if (!accountIds.length) {
    const empty = 'No data\n';
    return new NextResponse(empty, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="report-${period}-empty.csv"` } });
  }

  const idsLiteral = sql.raw(accountIds.map(id => `'${id}'::uuid`).join(','));
  const baseWhere = sql`${transactions.userId} = ${auth.userId} AND ${transactions.accountId} = ANY(ARRAY[${idsLiteral}])`;

  let rows: Array<Record<string, unknown>> = [];
  let filename = `report-${period}-${businessDateString()}.csv`;

  if (period === 'daily') {
    const from = parseDateParam(url.searchParams.get('from'));
    const boundClock = zonedClock(toExclusive, BUSINESS_TIME_ZONE);
    const start = from
      ? businessDayStart(from)
      : instantFromWallClock({ year: boundClock.year, month: boundClock.month - 30, day: 1, hour: 0, minute: 0, second: 0 }, BUSINESS_TIME_ZONE);
    const dbRows = await db.select({
      date: localDayText,
      income: sql<number>`SUM(CASE WHEN ${transactions.type} IN ('income','adjustment') THEN ${transactions.amount} ELSE 0 END)`,
      expense: sql<number>`SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END)`,
      transfer: sql<number>`SUM(CASE WHEN ${transactions.type} = 'transfer' THEN ${transactions.amount} ELSE 0 END)`,
    }).from(transactions).where(and(baseWhere, gte(transactions.date, start), lt(transactions.date, toExclusive))).groupBy(localDay).orderBy(localDay);
    rows = dbRows.map((r) => ({ date: (r.date as string)?.slice(0, 10) ?? '', income: r.income, expense: r.expense, transfer: r.transfer }));
  } else if (period === 'monthly') {
    const from = parseDateParam(url.searchParams.get('from'));
    const boundClock = zonedClock(toExclusive, BUSINESS_TIME_ZONE);
    const start = from
      ? instantFromWallClock({ year: boundClock.year, month: boundClock.month, day: 1, hour: 0, minute: 0, second: 0 }, BUSINESS_TIME_ZONE)
      : instantFromWallClock({ year: boundClock.year - 1, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, BUSINESS_TIME_ZONE);
    const dbRows = await db.select({
      month: localMonthText,
      income: sql<number>`SUM(CASE WHEN ${transactions.type} IN ('income','adjustment') THEN ${transactions.amount} ELSE 0 END)`,
      expense: sql<number>`SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END)`,
      transfer: sql<number>`SUM(CASE WHEN ${transactions.type} = 'transfer' THEN ${transactions.amount} ELSE 0 END)`,
    }).from(transactions).where(and(baseWhere, gte(transactions.date, start), lt(transactions.date, toExclusive))).groupBy(localMonth).orderBy(localMonth);
    rows = dbRows.map((r) => ({ month: (r as any).month ?? '', income: r.income, expense: r.expense, transfer: r.transfer }));
  } else if (period === 'category') {
    const dbRows = await db.select({
      categoryId: transactions.categoryId,
      type: categories.type,
      name: categories.name,
      amount: sql<number>`SUM(${transactions.amount})`,
      count: sql<number>`COUNT(*)`,
    }).from(transactions).leftJoin(categories, eq(categories.id, transactions.categoryId)).where(and(baseWhere, lt(transactions.date, toExclusive), sql`${transactions.type} <> 'transfer'`)).groupBy(transactions.categoryId, categories.type, categories.name).orderBy(sql`SUM(${transactions.amount})`);
    rows = dbRows.map((r) => ({ categoryId: r.categoryId ?? '', type: r.type ?? '', name: r.name ?? 'Uncategorized', amount: r.amount, count: r.count }));
  } else if (period === 'cashflow') {
    const dbRows = await db.select({ date: localDayText, income: sql<number>`SUM(CASE WHEN ${transactions.type} IN ('income','adjustment') THEN ${transactions.amount} ELSE 0 END)`, expense: sql<number>`SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END)` }).from(transactions).where(and(baseWhere, lt(transactions.date, toExclusive))).groupBy(localDay).orderBy(localDay);
    rows = dbRows.map((r) => ({ date: (r.date as string)?.slice(0, 10) ?? '', income: r.income, expense: r.expense }));
  }

  const lines = [Object.keys(rows[0] ?? {}).join(',')];
  for (const row of rows) {
    lines.push(Object.values(row).map((value) => escapeCsv(String(value))).join(','));
  }

  const body = `${lines.join('\n')}\n`;
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` } });
}
