import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, accounts, accountMembers, categories, transactions, auditLog, userSettings } from '@/lib/db/schema';
import { getUserFromRequest } from '@/lib/helpers/accounts';
import { authenticateRequest } from '@/lib/auth/auth';
import { authorizeApiKey } from '@/lib/helpers/external';
import { rateLimit } from '@/lib/auth/rate-limit';
import { appendAudit } from '@/lib/auth/handler';
import * as zlib from 'zlib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function plain(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) out[k] = plain(value[k]);
    return out;
  }
  return value;
}
function ok(data?: any, status = 200) {
  return NextResponse.json({ success: true, data }, { status, headers: { 'cache-control': 'no-store' } });
}
function fail(message: string, field = 'error', status = 400) {
  return NextResponse.json({ success: false, error: message, field }, { status, headers: { 'cache-control': 'no-store' } });
}
function unauthorized(field = 'auth') { return fail('Not authenticated', field, 401); }
function forbidden(field = 'role') { return fail('Forbidden', field, 403); }
function rateLimitExceeded() { return fail('Rate limit exceeded', 'rate_limit', 429); }

export async function requireOwner(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) return { ok: false as const, response: unauthorized() };
  if (auth.role !== 'owner') return { ok: false as const, response: forbidden() };
  if (!(await rateLimit({ key: `backup:${auth.userId}`, limit: 30, windowMs: 60_000 }))) return { ok: false as const, response: rateLimitExceeded() };
  return { ok: true as const, auth, response: null as Response | null };
}

export function pickApiKeyOrWriteScope(request: NextRequest) {
  return authorizeApiKey(request, 'backup:write');
}

async function collect() {
  return Promise.all([
    db.select().from(users),
    db.select().from(userSettings),
    db.select().from(accounts),
    db.select().from(accountMembers),
    db.select().from(categories),
    db.select().from(transactions),
    db.select().from(auditLog),
  ]).then(([u, s, a, m, c, t, l]) => ({
    users: u.map(plain),
    userSettings: s.map(plain),
    accounts: a.map(plain),
    accountMembers: m.map(plain),
    categories: c.map(plain),
    transactions: t.map(plain),
    auditLog: l.map(plain),
  }));
}

async function execBackup(userId: string, ip: string) {
  const tables = await collect();
  const payload = { version: 1, exportedAt: new Date().toISOString(), tables };
  const json = JSON.stringify(payload);
  const gz = zlib.gzipSync(json, { level: 9 });
  await appendAudit(userId, 'backup.download', { bytes: gz.length }, ip);
  return new Response(gz, {
    status: 200,
    headers: {
      'content-type': 'application/gzip',
      'content-disposition': `attachment; filename="anycash-backup-${new Date().toISOString().slice(0, 10)}.json.gz"`,
      'cache-control': 'no-store',
    },
  });
}

export async function handleGet(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '';
  const { auth, response } = await requireOwner(request);
  if (auth) {
    if (response) return response;
    try { return await execBackup(auth.userId, ip); } catch (e: any) { return fail(e?.message ?? 'Backup failed', 'backup', 500); }
  }
  const apiAuth = await authenticateRequest(request, 'backup:read');
  if (apiAuth && apiAuth.role === 'owner') {
    try { return await execBackup(apiAuth.userId, ip); } catch (e: any) { return fail(e?.message ?? 'Backup failed', 'backup', 500); }
  }
  return response ?? unauthorized();
}

async function readBackupBuffer(request: NextRequest) {
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('file is required');
    return Buffer.from(await file.arrayBuffer());
  }
  return Buffer.from(await request.arrayBuffer());
}

async function parsePayload(request: NextRequest) {
  const buffer = await readBackupBuffer(request);
  const isGz = buffer[0] === 0x1f && buffer[1] === 0x8b;
  let text: string;
  try { text = isGz ? zlib.gunzipSync(buffer).toString('utf-8') : buffer.toString('utf-8'); }
  catch { throw new Error('Invalid compressed payload'); }
  let parsed: any;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('Invalid JSON payload'); }
  if (parsed?.version !== 1 || typeof parsed?.tables !== 'object') throw new Error('Invalid backup schema');
  return parsed as { exportedAt: string; tables: Record<string, any[]> };
}

async function previewCollect() {
  return collect();
}

export async function previewRestorePayload(request: NextRequest) {
  const existing = await previewCollect();
  const payload = await parsePayload(request);
  const { exportedAt, tables } = payload;
  const catRows = tables.categories ?? [];
  let invalidCategory = false;
  for (const c of catRows) {
    if (!['income', 'expense', 'transfer', 'adjustment'].includes(c.type)) { invalidCategory = true; break; }
  }
  const accountRows = tables.accounts ?? [];
  const txRows = tables.transactions ?? [];
  const auditRows = tables.auditLog ?? [];
  const rawUsers = tables.users ?? [];
  const usersTotal = rawUsers.length;
  const emailsInFile = new Set(rawUsers.map((u: any) => u.email));
  const existingEmails = new Set(existing.users.map((u) => u.email));
  const uniqueEmails = emailsInFile.size;
  const rowsToSkip = rawUsers.filter((u: any) => !u?.id || !existingEmails.has(u.email)).length;
  const existingRowsAffected = accountRows.length + (tables.accountMembers?.length ?? 0) + catRows.length + txRows.length + auditRows.length;
  const rowsToInsert = Math.max(0, existingRowsAffected - rowsToSkip);
  return {
    exportedAt,
    tablesCount: Object.keys(tables).length,
    existingRowsAffected,
    rowsToInsert,
    rowsToSkip,
    safeToApply: !invalidCategory,
    users: { total: usersTotal, uniqueEmails, newEmails: uniqueEmails },
    categoryReferencesInvalid: invalidCategory,
  };
}

export async function applyRestorePayload(request: NextRequest) {
  const payload = await parsePayload(request);

  await db.transaction(async (tx) => {
    const idMap: Record<string, string> = {};
    const remap = (id?: string | null) => (id && idMap[id] ? idMap[id] : (id ?? null));

    const snapshotUsers = async () => {
      const rows = await tx.select().from(users);
      const map = new Map(rows.map((r) => [r.id, r]));
      return map;
    };

    const restoreUsers = async (existing: Map<string, any>) => {
      for (const u of payload.tables.users ?? []) {
        if (!u?.id || !u?.email) continue;
        const prev = existing.get(u.id);
        const values: any = { id: u.id, email: u.email, role: u.role, passwordHash: u.passwordHash };
        if (prev) values.username = u.username ?? prev.username;
        const [row] = await tx.insert(users).values(values).onConflictDoUpdate({ target: users.email, set: { username: u.username, passwordHash: u.passwordHash, role: u.role } }).returning();
        idMap[u.id] = row.id;
      }
    };

    const restoreSettings = async () => {
      for (const s of payload.tables.userSettings ?? []) {
        if (!s?.userId || !remap(s.userId)) continue;
        await tx.insert(userSettings).values({ userId: remap(s.userId)!, rateSource: s.rateSource ?? 'manual', updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date() }).onConflictDoUpdate({ target: userSettings.userId, set: { rateSource: s.rateSource, updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date() } });
      }
    };

    const restoreCategories = async () => {
      const catIdMap = new Map<string, string>();
      for (const c of payload.tables.categories ?? []) {
        if (!c?.id || !c?.name || !['income', 'expense', 'transfer', 'adjustment'].includes(c.type)) continue;
        const parent = c.parentId && catIdMap.has(c.parentId) ? catIdMap.get(c.parentId)! : null;
        const [row] = await tx.insert(categories).values({ id: c.id, name: c.name, type: c.type, parentId: parent, isDefault: !!c.isDefault, isHidden: !!c.isHidden }).onConflictDoUpdate({ target: categories.id, set: { name: c.name, type: c.type, parentId: parent, isHidden: c.isHidden } }).returning();
        catIdMap.set(c.id, row.id);
        idMap[c.id] = row.id;
      }
    };

    const existingUsersMap = await snapshotUsers();

    const restoreAccounts = async () => {
      for (const a of payload.tables.accounts ?? []) {
        const mappedUser = remap(a.userId);
        if (!a?.id || !mappedUser || !existingUsersMap.has(mappedUser)) continue;
        const [row] = await tx.insert(accounts).values({ id: a.id, userId: mappedUser, name: a.name, type: a.type, currency: a.currency, balance: a.balance, accountNumber: a.accountNumber, creditLimit: a.creditLimit, statementDate: a.statementDate, dueDate: a.dueDate }).onConflictDoUpdate({ target: accounts.id, set: { userId: mappedUser, name: a.name, type: a.type, currency: a.currency, balance: a.balance, accountNumber: a.accountNumber, creditLimit: a.creditLimit, statementDate: a.statementDate, dueDate: a.dueDate } }).returning();
        idMap[a.id] = row.id;
      }
    };

    const existingAccounts = new Set((await tx.select().from(accounts)).map((a) => a.id));

    const restoreMembers = async () => {
      const safe: any[] = [];
      const currentUsers = new Set((await tx.select().from(users)).map((u) => u.id));
      for (const m of payload.tables.accountMembers ?? []) {
        const aid = remap(m.accountId); const uid = remap(m.userId);
        if (aid && uid && existingAccounts.has(aid) && currentUsers.has(uid)) safe.push({ accountId: aid, userId: uid, role: m.role, joinedAt: m.joinedAt ? new Date(m.joinedAt) : new Date() });
      }
      if (safe.length) await tx.insert(accountMembers).values(safe).onConflictDoNothing();
    };

    const restoreTransactions = async () => {
      for (const t of payload.tables.transactions ?? []) {
        const mappedAccount = remap(t.accountId); const mappedUser = remap(t.userId);
        if (!t?.id || !mappedAccount || !mappedUser) continue;
        const categoryId = t.categoryId && idMap[t.categoryId] ? idMap[t.categoryId] : null;
        const subcategoryId = t.subcategoryId && idMap[t.subcategoryId] ? idMap[t.subcategoryId] : null;
        await tx.insert(transactions).values({ id: t.id, accountId: mappedAccount, userId: mappedUser, amount: t.amount, amountSource: t.amountSource, amountDestination: t.amountDestination, type: t.type, note: t.note, date: t.date ? new Date(t.date) : new Date(), categoryId, subcategoryId, payee: t.payee, tags: Array.isArray(t.tags) ? t.tags : [], transferPairId: t.transferPairId && idMap[t.transferPairId] ? idMap[t.transferPairId] : t.transferPairId, exchangeRate: t.exchangeRate, exchangeCurrency: t.exchangeCurrency, rateSource: t.rateSource }).onConflictDoUpdate({ target: transactions.id, set: { accountId: mappedAccount, userId: mappedUser, amount: t.amount, amountSource: t.amountSource, amountDestination: t.amountDestination, type: t.type, note: t.note, date: t.date ? new Date(t.date) : new Date(), categoryId, subcategoryId, payee: t.payee, tags: Array.isArray(t.tags) ? t.tags : [], transferPairId: t.transferPairId && idMap[t.transferPairId] ? idMap[t.transferPairId] : t.transferPairId, exchangeRate: t.exchangeRate, exchangeCurrency: t.exchangeCurrency, rateSource: t.rateSource } });
      }
    };

    await restoreUsers(existingUsersMap);
    await restoreSettings();
    await restoreCategories();
    await restoreAccounts();
    await restoreMembers();
    await restoreTransactions();
  });

  let actorId: string | undefined;
  const ownerAuth = await getUserFromRequest(request);
  if (ownerAuth?.role === 'owner') actorId = ownerAuth.userId;
  else {
    const apiPick = await pickApiKeyOrWriteScope(request);
    const any: any = apiPick;
    actorId = any?.user?.id;
  }
  await appendAudit(actorId, 'backup.restore', { confirmed: true, exportedAt: payload.exportedAt }, request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '');

  return { applied: true, exportedAt: payload.exportedAt };
}

export async function handlePost(request: NextRequest) {
  const confirmed = new URL(request.url).searchParams.get('confirm') === 'true';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '';
  let auth = await getUserFromRequest(request);
  if (!auth) {
    const apiAuth = await authenticateRequest(request, 'backup:write');
    if (apiAuth && apiAuth.role === 'owner') auth = apiAuth;
  }
  if (!auth) return fail('Not authenticated', 'auth', 401);
  if (auth.role !== 'owner') return fail('Forbidden', 'role', 403);
  if (!(await rateLimit({ key: `restore:${auth.userId}`, limit: 3, windowMs: 60_000 }))) return fail('Rate limit exceeded', 'rate_limit', 429);

  if (!confirmed) {
    try {
      const preview = await previewRestorePayload(request);
      return ok(preview);
    } catch (e: any) {
      return fail(e?.message ?? 'Invalid backup payload', 'payload', 400);
    }
  }

  try {
    const result = await applyRestorePayload(request);
    await appendAudit(auth.userId, 'backup.restore', { confirmed: true, exportedAt: result.exportedAt }, ip);
    return ok(result);
  } catch (e: any) {
    return fail(e?.message ?? 'Restore failed', 'restore', 500);
  }
}

export async function GET(request: NextRequest) {
  return handleGet(request);
}
export async function POST(request: NextRequest) {
  return handlePost(request);
}
