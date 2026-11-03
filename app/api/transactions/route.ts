import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transactions, accounts, accountMembers, categories } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getUserFromRequest, authorizeAccountAccess } from '@/lib/helpers/accounts';
import { authenticateRequest } from '@/lib/auth/auth';
import { envelope } from '@/lib/auth/handler';
import { appendAudit } from '@/lib/auth/handler';
import { rateLimit } from '@/lib/auth/rate-limit';
import { resolvePaymentAccount } from '@/lib/transactions/routing';
import { aggregateBalanceDeltas } from '@/lib/transactions/balance';
import { parseTransactionDate } from '@/lib/transactions/datetime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const validTypes = ['income', 'expense', 'transfer', 'adjustment'] as const;

type TransactionRow = typeof transactions.$inferSelect;

async function accessibleRoutingAccounts(userId: string) {
  return db.select({ id: accounts.id, name: accounts.name, type: accounts.type })
    .from(accounts)
    .leftJoin(accountMembers, eq(accounts.id, accountMembers.accountId))
    .where(sql`${accounts.userId} = ${userId} OR ${accountMembers.userId} = ${userId}`)
    .groupBy(accounts.id, accounts.name, accounts.type);
}

async function validatePaymentRouting(body: Record<string, unknown>, accountId: string, userId: string) {
  const hasRoutingFields = Object.prototype.hasOwnProperty.call(body, 'payment_method')
    || Object.prototype.hasOwnProperty.call(body, 'account_name');
  if (!hasRoutingFields) return null;
  const routing = resolvePaymentAccount(
    await accessibleRoutingAccounts(userId),
    body.payment_method,
    body.account_name,
  );
  if (routing.error || !routing.account) {
    return { error: routing.error ?? 'Payment account could not be resolved', field: 'payment_method' };
  }
  if (routing.account.id !== accountId) {
    return { error: `Resolved account does not match account_id: ${routing.account.name}`, field: 'account_name' };
  }
  return { account: routing.account, paymentMethod: routing.method };
}

function requirePositiveIntegerAmount(raw: unknown): number {
  const amountRaw = Number(raw ?? 0);
  if (!Number.isFinite(amountRaw) || amountRaw <= 0 || !Number.isInteger(amountRaw)) {
    throw new Error('Invalid amount');
  }
  return Math.trunc(amountRaw);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidUuid(value: unknown, field: string) {
  const text = String(value ?? '').trim();
  if (!text) return { error: `${field} is required`, field };
  if (!UUID_PATTERN.test(text)) return { error: `${field} must be a UUID`, field };
  return null;
}

// An invented category (stale copy, typo) otherwise reaches Postgres and comes back as an opaque
// 500 from the foreign key. Reject it here with a field-level 400 instead.
async function unknownCategory(categoryId?: string) {
  if (!categoryId) return null;
  const rows = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!rows.length) return { error: `Category not found: ${categoryId}`, field: 'categoryId' };
  return null;
}

function databaseFailure(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === '23503') return { error: 'Referenced account or category does not exist', field: 'reference' };
  if (code === '23505') return { error: 'Transaction already recorded', field: 'duplicate' };
  console.error('[transactions] write failed', code ?? error);
  return { error: 'Transaction could not be saved', field: 'server' };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, 'transactions:read');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `transactions:${auth.userId}`, limit: 100, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get('account_id')?.trim();
  const ids = accountId ? [accountId] : await db.select({ id: accounts.id }).from(accounts)
    .leftJoin(accountMembers, eq(accounts.id, accountMembers.accountId))
    .where(sql`${accounts.userId} = ${auth.userId} OR ${accountMembers.userId} = ${auth.userId}`)
    .groupBy(accounts.id).then(r => r.map(a => a.id));
  if (!ids.length) return envelope([]);
  if (accountId) {
    const forbidden = await authorizeAccountAccess({ accountId, userId: auth.userId, role: auth.role, allowMember: true });
    if (forbidden) return forbidden;
  }
  const data = await db.select().from(transactions)
    .where(sql`${transactions.accountId} = ANY(ARRAY[${sql.join(ids.map(id => sql`${id}::uuid`), sql`, `)}]::uuid[])`)
    .orderBy(desc(transactions.date));
  return envelope(data);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  const auth = await authenticateRequest(request, 'transactions:write');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `transactions:write:${auth.userId}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const type = String(body.type || '').toLowerCase();
  if (!validTypes.includes(type as any)) return envelope(undefined, 'Invalid type', 'type', 400);
  const transactionDate = parseTransactionDate(body.date);
  if (!transactionDate) return envelope(undefined, 'Invalid date', 'date', 400);
  const categoryId = (body as any).categoryId ? String((body as any).categoryId) : undefined;
  const categoryProblem = await unknownCategory(categoryId);
  if (categoryProblem) return envelope(undefined, categoryProblem.error, categoryProblem.field, 400);

  if (type === 'transfer') {
    const sourceAccountId = String((body as any).account_id ?? '').trim();
    const destinationAccountId = String((body as any).destination_account_id ?? '').trim();
    if (!sourceAccountId || !destinationAccountId) return envelope(undefined, 'account_id and destination_account_id required', 'transfer', 400);
    if (sourceAccountId === destinationAccountId) return envelope(undefined, 'Source and destination must differ', 'transfer', 400);
    const sourceIdProblem = invalidUuid(sourceAccountId, 'account_id');
    if (sourceIdProblem) return envelope(undefined, sourceIdProblem.error, sourceIdProblem.field, 400);
    const destinationIdProblem = invalidUuid(destinationAccountId, 'destination_account_id');
    if (destinationIdProblem) return envelope(undefined, destinationIdProblem.error, destinationIdProblem.field, 400);
    const forbidden = await authorizeAccountAccess({ accountId: sourceAccountId, userId: auth.userId, role: auth.role });
    if (forbidden) return forbidden;
    const forbidden2 = await authorizeAccountAccess({ accountId: destinationAccountId, userId: auth.userId, role: auth.role });
    if (forbidden2) return forbidden2;

    const accountRows = await Promise.all([
      db.select().from(accounts).where(eq(accounts.id, sourceAccountId)).limit(1),
      db.select().from(accounts).where(eq(accounts.id, destinationAccountId)).limit(1),
    ]);
    const sourceAccount = accountRows[0][0];
    const destinationAccount = accountRows[1][0];
    if (!sourceAccount || !destinationAccount) return envelope(undefined, 'Account not found', 'account_id', 404);
    const sourceRouting = await validatePaymentRouting(body, sourceAccount.id, auth.userId);
    if (sourceRouting?.error) return envelope(undefined, sourceRouting.error, sourceRouting.field, 400);

    let exchangeRateValue: string | undefined;
    let amountDestination: number;
    const rateProvider = String((process.env.EXCHANGE_RATE_PROVIDER ?? 'manual')).toLowerCase();
    const manualRateRaw = (body as any).exchange_rate;
    const crossCurrency = sourceAccount.currency !== destinationAccount.currency;
    if (crossCurrency) {
      if (rateProvider === 'manual') {
        if (typeof manualRateRaw !== 'number' || manualRateRaw <= 0) return envelope(undefined, 'Manual exchange_rate required for cross-currency', 'exchange_rate', 400);
        exchangeRateValue = String(manualRateRaw);
        amountDestination = Math.trunc(requirePositiveIntegerAmount((body as any).amount) * manualRateRaw);
      } else {
        return envelope(undefined, 'External rate provider not configured', 'exchange_rate', 501);
      }
    } else {
      amountDestination = requirePositiveIntegerAmount((body as any).amount);
    }

    const amount = requirePositiveIntegerAmount((body as any).amount);
    const note = String((body as any).note ?? '').trim() || undefined;
    const payee = String((body as any).payee ?? '').trim() || undefined;
    const tags = Array.isArray((body as any).tags) ? (body as any).tags.map(String) : [];

    let sourceTx: TransactionRow;
    let destinationTx: TransactionRow;
    try {
      ({ sourceTx, destinationTx } = await db.transaction(async (txDb) => {
        const [createdSourceTx] = await txDb.insert(transactions).values({
          accountId: sourceAccount.id, userId: auth.userId, amount: -amount, amountSource: amount, type: 'transfer',
          note, payee, tags, categoryId, date: transactionDate,
          exchangeRate: exchangeRateValue ?? null, exchangeCurrency: crossCurrency ? sourceAccount.currency : null, rateSource: crossCurrency ? (rateProvider === 'manual' ? 'manual' : rateProvider) : null
        }).returning();
        const [createdDestinationTx] = await txDb.insert(transactions).values({
          accountId: destinationAccount.id, userId: auth.userId, amount: amountDestination, amountDestination, type: 'transfer',
          note, payee, tags, categoryId, date: transactionDate,
          exchangeRate: exchangeRateValue ?? null, exchangeCurrency: crossCurrency ? sourceAccount.currency : null, rateSource: crossCurrency ? (rateProvider === 'manual' ? 'manual' : rateProvider) : null, transferPairId: createdSourceTx.id
        }).returning();

        await txDb.update(transactions).set({ transferPairId: createdDestinationTx.id }).where(eq(transactions.id, createdSourceTx.id));
        const deltas = aggregateBalanceDeltas([
          [sourceAccount.id, -amount],
          [destinationAccount.id, amountDestination],
        ]);
        for (const [accountIdToUpdate, delta] of deltas) {
          await txDb.update(accounts)
            .set({ balance: sql`${accounts.balance} + ${delta}` })
            .where(eq(accounts.id, accountIdToUpdate));
        }
        return { sourceTx: createdSourceTx, destinationTx: createdDestinationTx };
      }));
    } catch (error) {
      const failure = databaseFailure(error);
      return envelope(undefined, failure.error, failure.field, failure.field === 'server' ? 500 : 400);
    }
    await appendAudit(auth.userId, 'transactions.transfer', { source: sourceAccount.id, destination: destinationAccount.id, amount, amountDestination }, ip);

    return envelope({
      source: sourceTx,
      destination: destinationTx,
      amountSource: amount,
      amountDestination,
      resolvedAccount: sourceRouting?.account ? {
        id: sourceRouting.account.id,
        name: sourceRouting.account.name,
        type: sourceRouting.account.type,
        paymentMethod: sourceRouting.paymentMethod,
      } : undefined,
    }, undefined, undefined, 201);
  }

  const accountId = String((body as any).account_id ?? '').trim();
  const accountIdProblem = invalidUuid(accountId, 'account_id');
  if (accountIdProblem) return envelope(undefined, accountIdProblem.error, accountIdProblem.field, 400);
  const forbidden = await authorizeAccountAccess({ accountId, userId: auth.userId, role: auth.role });
  if (forbidden) return forbidden;
  const accountRows = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const account = accountRows[0];
  if (!account) return envelope(undefined, 'Account not found', 'account_id', 404);
  const routing = await validatePaymentRouting(body, account.id, auth.userId);
  if (routing?.error) return envelope(undefined, routing.error, routing.field, 400);

  const amount = requirePositiveIntegerAmount((body as any).amount);
  const signedAmount = (type === 'income' || type === 'adjustment' ? 1 : -1) * amount;

  let tx: TransactionRow;
  try {
    tx = await db.transaction(async (txDb) => {
      const [created] = await txDb.insert(transactions).values({
        accountId: account.id, userId: auth.userId, amount: signedAmount, type,
        date: transactionDate,
        note: String((body as any).note ?? '').trim() || undefined,
        payee: String((body as any).payee ?? '').trim() || undefined,
        tags: Array.isArray((body as any).tags) ? (body as any).tags.map(String) : [],
        categoryId, subcategoryId: (body as any).subcategoryId ? String((body as any).subcategoryId) : undefined,
      }).returning();
      await txDb.update(accounts)
        .set({ balance: sql`${accounts.balance} + ${signedAmount}` })
        .where(eq(accounts.id, account.id));
      return created;
    });
  } catch (error) {
    const failure = databaseFailure(error);
    return envelope(undefined, failure.error, failure.field, failure.field === 'server' ? 500 : 400);
  }
  await appendAudit(auth.userId, `transactions.${type}`, { id: tx.id, amount: signedAmount }, ip);
  return envelope({
    ...tx,
    resolvedAccount: routing?.account ? {
      id: routing.account.id,
      name: routing.account.name,
      type: routing.account.type,
      paymentMethod: routing.paymentMethod,
    } : undefined,
  }, undefined, undefined, 201);
}

export async function PUT(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? undefined;
  const auth = await authenticateRequest(request, 'transactions:write');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `transactions:write:${auth.userId}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const id = String((body as any).id ?? '').trim();
  if (!id) return envelope(undefined, 'id is required', 'id', 400);

  const txRows = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  const tx = txRows[0];
  if (!tx) return envelope(undefined, 'Not found', 'id', 404);
  const forbidden = await authorizeAccountAccess({ accountId: tx.accountId, userId: auth.userId, role: auth.role });
  if (forbidden) return forbidden;

  const type = String((body as any).type ?? tx.type).toLowerCase();
  if (!validTypes.includes(type as any)) return envelope(undefined, 'Invalid type', 'type', 400);
  const categoryProblem = await unknownCategory((body as any).categoryId ? String((body as any).categoryId) : undefined);
  if (categoryProblem) return envelope(undefined, categoryProblem.error, categoryProblem.field, 400);
  // Keep the recorded time-of-day when the edited date stays on the same business day.
  const transactionDate = parseTransactionDate((body as any).date, { preserve: tx.date });
  if (!transactionDate) return envelope(undefined, 'Invalid date', 'date', 400);

  const amountRaw = (body as any).amount;
  let newAmount: number;
  if (amountRaw !== undefined && amountRaw !== null && String(amountRaw) !== '') {
    newAmount = requirePositiveIntegerAmount(amountRaw);
  } else {
    newAmount = Math.abs(tx.amount);
  }
  const signedAmount = (type === 'income' || type === 'adjustment' ? 1 : -1) * newAmount;
  const amountDiff = signedAmount - tx.amount;
  const accountId = (body as any).account_id ? String((body as any).account_id) : tx.accountId;
  const destinationAccountId = (body as any).destination_account_id ? String((body as any).destination_account_id) : (tx as any).transferPartnerAccountId;

  if (type === 'transfer') {
    const sourceAccountId = String((body as any).account_id ?? tx.accountId).trim();
    const destAccountId = String((body as any).destination_account_id ?? '').trim();
    if (!sourceAccountId || !destAccountId) return envelope(undefined, 'account_id and destination_account_id required', 'transfer', 400);
    if (sourceAccountId === destAccountId) return envelope(undefined, 'Source and destination must differ', 'transfer', 400);
    const sourceIdProblem = invalidUuid(sourceAccountId, 'account_id');
    if (sourceIdProblem) return envelope(undefined, sourceIdProblem.error, sourceIdProblem.field, 400);
    const destinationIdProblem = invalidUuid(destAccountId, 'destination_account_id');
    if (destinationIdProblem) return envelope(undefined, destinationIdProblem.error, destinationIdProblem.field, 400);
    const forbidden1 = await authorizeAccountAccess({ accountId: sourceAccountId, userId: auth.userId, role: auth.role });
    if (forbidden1) return forbidden1;
    const forbidden2 = await authorizeAccountAccess({ accountId: destAccountId, userId: auth.userId, role: auth.role });
    if (forbidden2) return forbidden2;
    const sourceAccount = (await db.select().from(accounts).where(eq(accounts.id, sourceAccountId)).limit(1))[0];
    const destAccount = (await db.select().from(accounts).where(eq(accounts.id, destAccountId)).limit(1))[0];
    if (!sourceAccount || !destAccount) return envelope(undefined, 'Account not found', 'account_id', 404);
    const crossCurrency = sourceAccount.currency !== destAccount.currency;
    const rateProvider = String((process.env.EXCHANGE_RATE_PROVIDER ?? 'manual')).toLowerCase();
    const manualRateRaw = (body as any).exchange_rate;
    let exchangeRateValue: string | undefined;
    let amountDestination: number;
    if (crossCurrency) {
      if (rateProvider === 'manual') {
        if (typeof manualRateRaw !== 'number' || manualRateRaw <= 0) return envelope(undefined, 'Manual exchange_rate required for cross-currency', 'exchange_rate', 400);
        exchangeRateValue = String(manualRateRaw);
        amountDestination = Math.trunc(newAmount * manualRateRaw);
      } else {
        return envelope(undefined, 'External rate provider not configured', 'exchange_rate', 501);
      }
    } else {
      amountDestination = newAmount;
    }

    let sourceTx: TransactionRow;
    let sibling: TransactionRow | undefined;
    try {
      ({ sourceTx, sibling } = await db.transaction(async (txDb) => {
        const currentTx = (await txDb.select().from(transactions).where(eq(transactions.id, id)).limit(1))[0] ?? tx;
        const relatedRows = await txDb.select().from(transactions).where(eq(transactions.transferPairId, id)).limit(1);
        const sibling = relatedRows[0];
        const updated = await txDb.update(transactions).set({
          accountId: sourceAccount.id, amount: -newAmount, amountSource: newAmount, type: 'transfer',
          note: String((body as any).note ?? currentTx.note ?? '').trim() || undefined,
          payee: String((body as any).payee ?? currentTx.payee ?? '').trim() || undefined,
          tags: Array.isArray((body as any).tags) ? (body as any).tags.map(String) : (currentTx.tags ?? []),
          categoryId: (body as any).categoryId ? String((body as any).categoryId) : currentTx.categoryId,
          date: transactionDate,
          exchangeRate: exchangeRateValue ?? null, exchangeCurrency: crossCurrency ? sourceAccount.currency : null, rateSource: crossCurrency ? (rateProvider === 'manual' ? 'manual' : rateProvider) : null,
        }).where(eq(transactions.id, id)).returning();
        const sourceTx = updated[0];
        if (sibling) {
          await txDb.update(transactions).set({
            accountId: destAccount.id, amount: amountDestination, amountDestination, type: 'transfer',
            note: String((body as any).note ?? currentTx.note ?? '').trim() || undefined,
            payee: String((body as any).payee ?? currentTx.payee ?? '').trim() || undefined,
            tags: Array.isArray((body as any).tags) ? (body as any).tags.map(String) : (currentTx.tags ?? []),
            categoryId: (body as any).categoryId ? String((body as any).categoryId) : currentTx.categoryId,
            exchangeRate: exchangeRateValue ?? null, exchangeCurrency: crossCurrency ? sourceAccount.currency : null, rateSource: crossCurrency ? (rateProvider === 'manual' ? 'manual' : rateProvider) : null,
            transferPairId: sourceTx.id,
            date: transactionDate,
          }).where(eq(transactions.id, sibling.id));
        }
        const deltas = aggregateBalanceDeltas([
          [currentTx.accountId, -currentTx.amount],
          ...(sibling ? [[sibling.accountId, -sibling.amount] as const] : []),
          [sourceAccount.id, -newAmount],
          [destAccount.id, amountDestination],
        ]);
        for (const [accountIdToUpdate, delta] of deltas) {
          await txDb.update(accounts)
            .set({ balance: sql`${accounts.balance} + ${delta}` })
            .where(eq(accounts.id, accountIdToUpdate));
        }
        return { sourceTx, sibling };
      }));
    } catch (error) {
      const failure = databaseFailure(error);
      return envelope(undefined, failure.error, failure.field, failure.field === 'server' ? 500 : 400);
    }
    await appendAudit(auth.userId, 'transactions.transfer.update', { id: sourceTx.id, siblingId: sibling?.id, amount: newAmount, amountDestination }, ip);
    return envelope({ source: sourceTx, destination: sibling ? { id: sibling.id } : undefined });
  }

  const targetAccountId = String((body as any).account_id ?? tx.accountId);
  const forbiddenAcc = await authorizeAccountAccess({ accountId: targetAccountId, userId: auth.userId, role: auth.role });
  if (forbiddenAcc) return forbiddenAcc;
  const account = (await db.select().from(accounts).where(eq(accounts.id, targetAccountId)).limit(1))[0];
  if (!account) return envelope(undefined, 'Account not found', 'account_id', 404);

  let updated: TransactionRow;
  try {
    updated = await db.transaction(async (txDb) => {
      const [changed] = await txDb.update(transactions).set({
        accountId: account.id, amount: signedAmount, type,
        note: String((body as any).note ?? tx.note ?? '').trim() || undefined,
        payee: String((body as any).payee ?? tx.payee ?? '').trim() || undefined,
        tags: Array.isArray((body as any).tags) ? (body as any).tags.map(String) : (tx.tags ?? []),
        categoryId: (body as any).categoryId ? String((body as any).categoryId) : tx.categoryId,
        date: transactionDate,
      }).where(eq(transactions.id, id)).returning();
      const deltas = aggregateBalanceDeltas([
        [tx.accountId, -tx.amount],
        [account.id, signedAmount],
      ]);
      for (const [accountIdToUpdate, delta] of deltas) {
        await txDb.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${delta}` })
          .where(eq(accounts.id, accountIdToUpdate));
      }
      return changed;
    });
  } catch (error) {
    const failure = databaseFailure(error);
    return envelope(undefined, failure.error, failure.field, failure.field === 'server' ? 500 : 400);
  }

  await appendAudit(auth.userId, `transactions.${type}.update`, { id: updated.id, amount: signedAmount }, ip);
  return envelope(updated);
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, 'transactions:write');
  if (!auth) return envelope(undefined, 'Not authenticated', 'auth', 401);
  if (!(await rateLimit({ key: `transactions:write:${auth.userId}`, limit: 30, windowMs: 60_000 }))) {
    return envelope(undefined, 'Rate limit exceeded', 'rate_limit', 429);
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const id = String((body as any).id ?? '').trim();
  if (!id) return envelope(undefined, 'Invalid id', 'id', 400);
  const txRows = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  const tx = txRows[0];
  if (!tx) return envelope(undefined, 'Not found', 'id', 404);
  const forbidden = await authorizeAccountAccess({ accountId: tx.accountId, userId: auth.userId, role: auth.role });
  if (forbidden) return forbidden;

  if (tx.type === 'transfer') {
    const { sibling } = await db.transaction(async (txDb) => {
      const relatedRows = await txDb.select().from(transactions).where(eq(transactions.transferPairId, id)).limit(1);
      const sibling = relatedRows[0];
      await txDb.delete(transactions).where(eq(transactions.id, id));
      if (sibling) await txDb.delete(transactions).where(eq(transactions.id, sibling.id));
      const deltas = aggregateBalanceDeltas([
        [tx.accountId, -tx.amount],
        ...(sibling ? [[sibling.accountId, -sibling.amount] as const] : []),
      ]);
      for (const [accountIdToUpdate, delta] of deltas) {
        await txDb.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${delta}` })
          .where(eq(accounts.id, accountIdToUpdate));
      }
      return { sibling };
    });
    await appendAudit(auth.userId, 'transactions.transfer.revert', { id: tx.id, siblingId: sibling?.id });
    return envelope({ deleted: true });
  }

  await db.transaction(async (txDb) => {
    await txDb.update(accounts)
      .set({ balance: sql`${accounts.balance} + ${-tx.amount}` })
      .where(eq(accounts.id, tx.accountId));
    await txDb.delete(transactions).where(eq(transactions.id, id));
  });
  await appendAudit(auth.userId, 'transactions.delete', { id: tx.id });
  return envelope({ deleted: true });
}
