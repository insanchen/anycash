import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transactions, accounts, accountMembers, categories } from '@/lib/db/schema';
import { eq, and, desc, sql, gte, lte, lt } from 'drizzle-orm';
import { authenticateRequest } from '@/lib/auth/auth';
import { rateLimit } from '@/lib/auth/rate-limit';
import { BUSINESS_TIME_ZONE, instantFromWallClock, zonedClock } from '@/lib/transactions/datetime';

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
  const owned = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, userId));
  const memberRows = await db.select({ accountId: accountMembers.accountId }).from(accountMembers).where(eq(accountMembers.userId, userId));
  const ids = new Set<string>();
  for (const row of owned) ids.add(row.id);
  for (const row of memberRows) ids.add(row.accountId);
  return Array.from(ids);
}

// Reports group and bound by business day. The server may run in UTC, but a row entered at
// 00:30 WIB has to land on the same date the UI shows.
//
// The timezone has to be a literal. PostgreSQL matches SELECT expressions against GROUP BY
// expressions structurally, and two separate parameters never compare equal. So
// `date_trunc('day', ... $1)` in SELECT and `date_trunc('day', ... $2)` in GROUP BY are rejected
// with "column transactions.date must appear in the GROUP BY clause". BUSINESS_TIME_ZONE is a
// constant, so inlining it is safe.
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

function businessMonthStart(date: Date, yearShift = 0) {
  const clock = zonedClock(date, BUSINESS_TIME_ZONE);
  return instantFromWallClock(
    { year: clock.year + yearShift, month: clock.month, day: 1, hour: 0, minute: 0, second: 0 },
    BUSINESS_TIME_ZONE,
  );
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'transactions:read');
  if (!auth) return NextResponse.json({ success: false, error: 'Not authenticated', field: 'auth' }, { status: 401 });
  if (!(await rateLimit({ key: `reports:${auth.userId}`, limit: 100, windowMs: 60_000 }))) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded', field: 'rate_limit' }, { status: 429 });
  }

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get('period'));
  if (!period) return NextResponse.json({ success: false, error: "period is required: daily|monthly|category|cashflow", field: 'period' }, { status: 400 });

  const from = parseDateParam(url.searchParams.get('from'));
  const to = parseDateParam(url.searchParams.get('to'));
  let upperBound = to ? new Date(to) : new Date();
  const toExclusive = lt(transactions.date, businessDayStart(upperBound, 1));

  const accountIds = await accessibleAccountIds(auth.userId);
  if (!accountIds.length) return NextResponse.json({ success: true, data: { period, rows: [] } });

  const idsLiteral = sql.raw(accountIds.map(id => `'${id}'::uuid`).join(','));
  const baseWhere = sql`${transactions.userId} = ${auth.userId} AND ${transactions.accountId} = ANY(ARRAY[${idsLiteral}])`;

  if (period === 'daily') {
    const start = businessDayStart(from ?? upperBound);
    const dayStart = gte(transactions.date, start);
    const rows = await db.select({
      date: localDayText,
      income: sql<number>`SUM(CASE WHEN ${transactions.type} IN ('income','adjustment') THEN ${transactions.amount} ELSE 0 END)`,
      expense: sql<number>`SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END)`,
      transfer: sql<number>`SUM(CASE WHEN ${transactions.type} = 'transfer' THEN ${transactions.amount} ELSE 0 END)`,
    })
      .from(transactions)
      .where(and(baseWhere, dayStart, toExclusive))
      .groupBy(localDay)
      .orderBy(localDay);
    return NextResponse.json({ success: true, data: { period, rows: rows.map((r) => ({ ...r, date: r.date?.slice(0, 10) ?? null })) } });
  }

  if (period === 'monthly') {
    const start = businessMonthStart(from ?? upperBound, from ? 0 : -1);
    const monthStart = gte(transactions.date, start);
    const rows = await db.select({
      month: localMonthText,
      income: sql<number>`SUM(CASE WHEN ${transactions.type} IN ('income','adjustment') THEN ${transactions.amount} ELSE 0 END)`,
      expense: sql<number>`SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END)`,
      transfer: sql<number>`SUM(CASE WHEN ${transactions.type} = 'transfer' THEN ${transactions.amount} ELSE 0 END)`,
    })
      .from(transactions)
      .where(and(baseWhere, monthStart, toExclusive))
      .groupBy(localMonth)
      .orderBy(localMonth);
    return NextResponse.json({ success: true, data: { period, rows: rows.map((r) => ({ ...r, month: (r as any).month ?? null })) } });
  }

  if (period === 'category') {
    const rows = await db.select({
      categoryId: transactions.categoryId,
      type: categories.type,
      name: categories.name,
      amount: sql<number>`SUM(${transactions.amount})`,
      count: sql<number>`COUNT(*)`,
    })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(baseWhere, toExclusive, sql`${transactions.type} <> 'transfer'`))
      .groupBy(transactions.categoryId, categories.type, categories.name)
      .orderBy(sql`SUM(${transactions.amount})`);
    return NextResponse.json({ success: true, data: { period, rows: rows.map((r) => ({ categoryId: r.categoryId, type: r.type ?? null, name: r.name ?? 'Uncategorized', amount: r.amount, count: r.count })) } });
  }

  if (period === 'cashflow') {
    const rows = await db.select({
      date: localDayText,
      income: sql<number>`SUM(CASE WHEN ${transactions.type} IN ('income','adjustment') THEN ${transactions.amount} ELSE 0 END)`,
      expense: sql<number>`SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END)`,
    })
      .from(transactions)
      .where(and(baseWhere, toExclusive))
      .groupBy(localDay)
      .orderBy(localDay);
    return NextResponse.json({ success: true, data: { period, rows: rows.map((r) => ({ ...r, date: (r as any).date?.slice(0, 10) ?? null })) } });
  }
}
