'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocale } from '@/lib/i18n/client';

type AccountType = 'personal' | 'joint' | 'credit_card';

type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  accountNumber?: string | null;
  creditLimit?: number | null;
  statementDate?: number | null;
  dueDate?: number | null;
  userId?: string;
  members?: Array<{ userId: string; role: string; username?: string | null; email?: string }>;
  sensitiveMasked?: boolean;
};

type Errors = Record<string, string>;

const baseShape = {
  name: '' as string,
  type: 'personal' as AccountType,
  currency: 'IDR',
  accountNumber: '',
  creditLimit: '',
  statementDate: '',
  dueDate: '',
};

const emptyAccount = (): Account => ({
  id: '',
  name: '',
  type: 'personal',
  currency: 'IDR',
  balance: 0,
  accountNumber: null,
  creditLimit: null,
  statementDate: null,
  dueDate: null,
  members: [],
});

export default function AccountsClient() {
  const { t } = useLocale();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState(() => ({ ...baseShape }));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareAccount, setShareAccount] = useState<Account | null>(null);
  const [shareTarget, setShareTarget] = useState('');
  const [createShareTarget, setCreateShareTarget] = useState('');
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const loadAccountOwner = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { method: 'GET', headers: { Accept: 'application/json' } });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success && json.data?.id) {
        setCurrentUserId(json.data.id);
      }
    } catch {
      // Ignore a failed lookup. The page still loads without the owner id.
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/accounts');
    const json = await res.json();
    if (json.success) setAccounts(json.data ?? []);
    setLoading(false);
    await loadAccountOwner();
  }, [loadAccountOwner]);

  useEffect(() => {
    load();
  }, [load]);

  const statusTimeoutRef = useRef<number | undefined>(undefined);

  const setStatusMsg = useCallback((msg: string) => {
    setStatus(msg);
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    statusTimeoutRef.current = window.setTimeout(() => setStatus(''), 2400);
  }, []);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm({ ...baseShape });
    setCreateShareTarget('');
    setErrors({});
    setOpen(true);
  }, []);

  const openEdit = useCallback((acc: Account) => {
    setEditing(acc);
    setForm({
      name: acc.name,
      type: acc.type,
      currency: acc.currency,
      accountNumber: acc.accountNumber ?? '',
      creditLimit: acc.creditLimit != null ? String(acc.creditLimit) : '',
      statementDate: acc.statementDate != null ? String(acc.statementDate) : '',
      dueDate: acc.dueDate != null ? String(acc.dueDate) : '',
    });
    setCreateShareTarget('');
    setErrors({});
    setOpen(true);
  }, []);

  const validate = (): boolean => {
    const next: Errors = {};
    const name = String(form.name ?? '').trim();
    if (!name || name.length === 0 || name.length > 200) {
      next.name = t('account.form.invalidName');
    }
    if (!/^[A-Z]{3}$/.test(String(form.currency ?? '').trim())) {
      next.currency = t('account.form.invalidCurrency');
    }
    if (form.accountNumber && !/^[0-9A-Za-z-]{1,64}$/.test(String(form.accountNumber).trim())) {
      next.accountNumber = t('account.form.invalidAccountNumber');
    }
    if (form.creditLimit && (!Number.isInteger(Number(form.creditLimit)) || Number(form.creditLimit) < 0)) {
      next.creditLimit = t('account.form.invalidCreditLimit');
    }
    if (form.statementDate) {
      const s = Number(form.statementDate);
      if (!Number.isInteger(s) || s < 1 || s > 31) next.statementDate = t('account.form.invalidDate');
    }
    if (form.dueDate) {
      const d = Number(form.dueDate);
      if (!Number.isInteger(d) || d < 1 || d > 31) next.dueDate = t('account.form.invalidDate');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    setStatus('');

    const payload: Record<string, unknown> = {
      name: String(form.name).trim(),
      type: form.type,
      currency: String(form.currency).trim().toUpperCase(),
      accountNumber: form.accountNumber || null,
      creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
      statementDate: form.statementDate ? Number(form.statementDate) : null,
      dueDate: form.dueDate ? Number(form.dueDate) : null,
    };

    try {
      if (!editing?.id && form.type === 'joint' && createShareTarget.trim()) {
        const userRes = await fetch(`/api/users?q=${encodeURIComponent(createShareTarget.trim())}`);
        const userJson = await userRes.json().catch(() => ({ success: false }));
        const row = (userJson?.success ? userJson.data ?? [] : []).find(
          (user: { email?: string }) => user.email?.toLowerCase() === createShareTarget.trim().toLowerCase(),
        );
        if (!row) {
          setErrors((prev) => ({ ...prev, 'server.generic': t('account.share.mustBeRegistered') }));
          return;
        }
        payload.members = [row.id];
      }
      const url = editing?.id ? '/api/accounts' : '/api/accounts';
      const res = await fetch(url, {
        method: editing?.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing?.id ? { ...payload, id: editing.id } : payload),
      });
      const json = await res.json();
      if (!json.success) {
        const key = json.field ? `server.${json.field}` : 'server.generic';
        setErrors((prev) => ({ ...prev, [key]: String(json.error ?? t('common.error')) }));
        setStatusMsg(String(json.error ?? t('common.error')));
        return;
      }
      await load();
      setOpen(false);
      setEditing(null);
      setCreateShareTarget('');
      setForm({ ...baseShape });
      setErrors({});
      setStatusMsg(editing ? t('account.form.updated') : t('account.form.created'));
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) return;
    setSubmitting(true);
    setStatus('');
    try {
      const res = await fetch('/api/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (json.success) {
        setAccounts((prev) => prev.filter((x) => x.id !== id));
        setConfirmDeleteId(null);
        setStatusMsg(t('account.form.deleted'));
      } else {
        setStatusMsg(String(json.error ?? t('common.error')));
      }
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const accountTypeLabel = (type: AccountType) => {
    switch (type) {
      case 'personal':
        return t('account.personal');
      case 'joint':
        return t('account.joint');
      case 'credit_card':
        return t('account.creditCard');
    }
  };

  const isOwner = (acc: Account) => currentUserId != null && acc.userId === currentUserId;
  const memberIds = (acc: Account) => Array.isArray(acc.members) ? acc.members.map((m) => m.userId) : [];
  const memberName = (member: NonNullable<Account['members']>[number]) => member.username?.trim() || member.email || member.userId;
  const isMember = (acc: Account, userId: string) => memberIds(acc).includes(userId);
  const isJoint = (acc: Account) => acc.type === 'joint';

  const shareStatusLabel = (acc: Account) => {
    if (!isJoint(acc)) return null;
    if (isOwner(acc)) return t('account.share.ownerLabel');
    if (isMember(acc, currentUserId ?? '')) return t('account.share.memberLabel');
    return null;
  };

  const moveAccount = async (id: string, direction: -1 | 1) => {
    const index = accounts.findIndex((account) => account.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= accounts.length) return;
    const next = [...accounts];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setAccounts(next);
    const res = await fetch('/api/account-order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountIds: next.map((account) => account.id) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      setAccounts(accounts);
      setStatusMsg(String(json.error ?? t('common.error')));
    }
  };

  const doShareAction = async (acc: Account, action: 'share' | 'unshare', targetUserId: string) => {
    if (submitting) return;
    setSubmitting(true);
    setStatus('');
    try {
      const res = await fetch(`/api/accounts/${acc.id}`, {
        method: action === 'unshare' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId: targetUserId }),
      });
      const json = await res.json();
      if (!json.success) {
        setStatusMsg(String(json.error ?? t('common.error')));
      } else {
        setStatusMsg(action === 'share' ? t('account.share.shared') : t('account.share.unshared'));
        await load();
      }
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">{t('common.loading')}</p>;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-heading text-2xl font-medium">{t('nav.accounts')}</h2>
        <div className="flex items-center gap-3">
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
          <button
            type="button"
            onClick={openCreate}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90"
            data-testid="accounts-create-button"
          >
            {t('account.form.create.title')}
          </button>
        </div>
      </div>

      {accounts.length === 0 && (
        <p className="text-muted-foreground">{t('account.form.emptyState')}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {accounts.map((acc) => {
          const owner = isOwner(acc);
          const joint = isJoint(acc);
          const statusLabel = shareStatusLabel(acc);
          const masked = Boolean(acc.sensitiveMasked);

          return (
            <div
              key={acc.id}
              className="flex min-h-[220px] flex-col justify-between gap-5 rounded-[26px] border border-border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-primary/50"
              data-testid="account-row"
            >
              <div className="space-y-1">
                <div className="flex items-start justify-between gap-3"><div><p className="font-heading text-xl font-semibold text-foreground">{acc.name}</p>
                <p className="text-xs uppercase text-muted-foreground">
                  {accountTypeLabel(acc.type)} · {acc.currency} · {masked ? '—' : (acc.accountNumber ?? '—')}
                </p>
                </div><span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-secondary-foreground">{accountTypeLabel(acc.type)}</span></div>
                <p className="mt-6 font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">{acc.balance.toLocaleString('id-ID')} <span className="text-xs font-bold text-muted-foreground">{acc.currency}</span></p>
                <p className="text-xs text-muted-foreground">
                  {t('account.creditLimit')}: {masked || acc.creditLimit == null ? '—' : Number(acc.creditLimit).toLocaleString('id-ID')}
                  {acc.statementDate != null && !masked ? ` · ${t('account.statementDate')} ${acc.statementDate}` : ''}
                  {acc.dueDate != null && !masked ? ` · ${t('account.dueDate')} ${acc.dueDate}` : ''}
                </p>
                {statusLabel && (
                  <p className="text-xs text-muted-foreground">{statusLabel}</p>
                )}
                {(acc.members ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('account.share.members')}: {(acc.members ?? []).map(memberName).join(', ')}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1"><button type="button" onClick={() => moveAccount(acc.id, -1)} disabled={accounts.indexOf(acc) === 0} aria-label={t('account.order.up')} className="rounded-full border border-border px-2 py-1 text-xs disabled:opacity-30">↑</button><button type="button" onClick={() => moveAccount(acc.id, 1)} disabled={accounts.indexOf(acc) === accounts.length - 1} aria-label={t('account.order.down')} className="rounded-full border border-border px-2 py-1 text-xs disabled:opacity-30">↓</button></div>
                <span className="flex flex-wrap items-center gap-2">
                  {owner && joint && (
                    <>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setShareAccount(acc);
                          setShareOpen(true);
                          setShareTarget('');
                          setShareError(null);
                          setShareSubmitting(false);
                        }}
                        className="text-xs underline underline-offset-4 hover:text-foreground"
                        data-testid="account-share-open"
                      >
                        {t('account.share.shareButton')}
                      </button>
                      {(acc.members ?? []).length > 0 && (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={async () => {
                            const ids = (acc.members ?? []).filter((m) => m.userId !== acc.userId).map((m) => m.userId);
                            if (!ids.length) return;
                            for (const id of ids) {
                              await doShareAction(acc, 'unshare', id);
                            }
                          }}
                          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                        >
                          {t('account.share.unshareAll')}
                        </button>
                      )}
                    </>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {owner && (
                    <button
                      type="button"
                      onClick={() => openEdit(acc)}
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      data-testid={`account-edit-${acc.id}`}
                    >
                      {t('common.edit')}
                    </button>
                  )}
                  {confirmDeleteId === acc.id ? (
                    <>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleDelete(acc.id)}
                        className="text-xs font-semibold text-red-500 hover:text-red-400"
                      >
                        {t('common.confirmDelete')}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(acc.id)}
                      className="text-xs text-red-500/80 hover:text-red-400"
                      data-testid={`account-delete-${acc.id}`}
                    >
                      {t('common.delete')}
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !submitting && setOpen(false)}
          />
          <div className="absolute left-1/2 top-[10%] w-full max-w-lg -translate-x-1/2 rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium">
                {editing ? t('account.edit.title') : t('account.create.title')}
              </h3>
              <button
                onClick={() => !submitting && setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t('common.cancel')}
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-sm text-muted-foreground">{t('account.form.name')}</label>
                <input
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder={t('account.form.namePlaceholder')}
                />
                {'name' in errors && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              <div>
                <label className="text-sm text-muted-foreground">{t('account.form.type')}</label>
                <select
                  value={form.type}
                  onChange={(e) => updateField('type', e.target.value as AccountType)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="personal">{accountTypeLabel('personal')}</option>
                  <option value="joint">{accountTypeLabel('joint')}</option>
                  <option value="credit_card">{accountTypeLabel('credit_card')}</option>
                </select>
              </div>

              {!editing && form.type === 'joint' && (
                <div>
                  <label className="text-sm text-muted-foreground">{t('account.share.shareTitle')}</label>
                  <input
                    value={createShareTarget}
                    onChange={(e) => setCreateShareTarget(e.target.value)}
                    placeholder={t('joint.searchUser')}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t('account.share.mustBeRegistered')}</p>
                </div>
              )}

              <div>
                <label className="text-sm text-muted-foreground">{t('account.form.currency')}</label>
                <input
                  value={form.currency}
                  onChange={(e) => updateField('currency', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm uppercase"
                />
                {'currency' in errors && <p className="mt-1 text-xs text-red-500">{errors.currency}</p>}
              </div>

              <div>
                <label className="text-sm text-muted-foreground">{t('account.form.accountNumber')}</label>
                <input
                  value={form.accountNumber}
                  onChange={(e) => updateField('accountNumber', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                {'server.accountNumber' in errors && <p className="mt-1 text-xs text-red-500">{errors['server.accountNumber']}</p>}
              </div>

              <div>
                <label className="text-sm text-muted-foreground">{t('account.creditLimit')}</label>
                <input
                  type="number"
                  value={form.creditLimit}
                  onChange={(e) => updateField('creditLimit', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                {'creditLimit' in errors && <p className="mt-1 text-xs text-red-500">{errors.creditLimit}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted-foreground">{t('account.statementDate')}</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.statementDate}
                    onChange={(e) => updateField('statementDate', e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                  {'statementDate' in errors && <p className="mt-1 text-xs text-red-500">{errors.statementDate}</p>}
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">{t('account.dueDate')}</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.dueDate}
                    onChange={(e) => updateField('dueDate', e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  />
                  {'dueDate' in errors && <p className="mt-1 text-xs text-red-500">{errors.dueDate}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="min-w-0">
                  {'server.generic' in errors && (
                    <p className="truncate text-xs text-red-500">{errors['server.generic']}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setOpen(false);
                      setEditing(null);
                      setErrors({});
                    }}
                    className="rounded-full border border-border px-4 py-2 text-sm hover:bg-accent"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
                  >
                    {submitting ? t('common.loading') : t('common.save')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {shareOpen && shareAccount && isJoint(shareAccount) && isOwner(shareAccount) && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !shareSubmitting && setShareOpen(false)}
          />
          <div className="absolute left-1/2 top-[10%] w-full max-w-lg -translate-x-1/2 rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <h3 className="mb-3 text-lg font-medium">{t('account.share.shareTitle')}</h3>
            <p className="mb-2 text-xs text-muted-foreground">{t('account.share.mustBeRegistered')}</p>
            <input
              value={shareTarget}
              onChange={(e) => setShareTarget(e.target.value.trim())}
              placeholder={t('joint.searchUser')}
              className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            {shareError && <p className="mb-2 text-xs text-red-500">{shareError}</p>}
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setShareOpen(false)} disabled={shareSubmitting} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-accent">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={shareSubmitting}
                onClick={async () => {
                  setShareSubmitting(true);
                  setShareError(null);
                  try {
                    const res = await fetch(`/api/users?q=${encodeURIComponent(shareTarget)}`);
                    const json = await res.json().catch(() => ({ success: false }));
                    const row = (json?.success ? json.data ?? [] : []).find((u: any) => u.email.toLowerCase() === shareTarget.toLowerCase());
                    if (!row) throw new Error(t('account.share.mustBeRegistered'));
                    await doShareAction(shareAccount, 'share', row.id);
                    setShareOpen(false);
                    setShareAccount(null);
                  } catch (e: unknown) {
                    setShareError(e instanceof Error ? e.message : t('common.error'));
                  } finally {
                    setShareSubmitting(false);
                  }
                }}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
              >
                {shareSubmitting ? t('common.loading') : t('joint.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
