'use client';

import * as React from 'react';
import { useLocale } from '@/lib/i18n/client';
import { businessDateString } from '@/lib/transactions/datetime';

type TxType = 'income' | 'expense' | 'transfer' | 'adjustment';

type TransactionRow = {
  id: string;
  account_id: string | null;
  type: TxType;
  amount: number;
  currency: string;
  categoryId: string | null;
  date: string;
  note: string | null;
  payee: string | null;
  tags: string[] | null;
};

type FormState = {
  type: TxType;
  account_id: string;
  account_name: string;
  payment_method: string;
  destination_account_id: string;
  amount: string;
  categoryId: string;
  date: string;
  note: string;
  payee: string;
  tags: string;
};

const emptyForm = (): FormState => ({
  type: 'expense',
  account_id: '',
  account_name: '',
  payment_method: '',
  destination_account_id: '',
  amount: '',
  categoryId: '',
  date: businessDateString(),
  note: '',
  payee: '',
  tags: '',
});

export default function TransactionsClient() {
  const { t, tf } = useLocale();
  const [accounts, setAccounts] = React.useState<Array<{ id: string; label: string; type: string }>>([]);
  const [categories, setCategories] = React.useState<Array<{ id: string; type: TxType; name: string }>>([]);
  const [rows, setRows] = React.useState<TransactionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [selectedAccountId, setSelectedAccountId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [nlInput, setNlInput] = React.useState('');
  const [nlLoading, setNlLoading] = React.useState(false);
  const [nlWarnings, setNlWarnings] = React.useState<string[]>([]);

  const [form, setForm] = React.useState<FormState>(emptyForm);

  const loadAccounts = React.useCallback(async () => {
    const res = await fetch('/api/accounts', { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (json.success) {
      const items = (json.data ?? []).map((a: any) => ({
        id: a.id,
        label: `${a.name} · ${a.currency}`,
        type: a.type,
      }));
      setAccounts(items);
      setSelectedAccountId((current) => current || items[0]?.id || '');
    }
  }, []);

  const loadCategories = React.useCallback(async () => {
    const res = await fetch('/api/categories');
    const json = await res.json().catch(() => ({}));
    if (json.success) setCategories(json.data ?? []);
  }, []);

  const loadTransactions = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = new URL('/api/transactions', window.location.origin);
    if (selectedAccountId) url.searchParams.set('account_id', selectedAccountId);
    const res = await fetch(url.pathname + url.search, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    setRows(json.data ?? []);
    setLoading(false);
  }, [selectedAccountId]);

  React.useEffect(() => {
    void loadAccounts();
    void loadCategories();
  }, [loadAccounts, loadCategories]);

  React.useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const filteredCategories = React.useMemo(() => categories.filter((c) => c.type === form.type), [categories, form.type]);

  function prefillForm(tx: TransactionRow) {
    setEditingId(tx.id);
    setForm({
      type: tx.type,
      account_id: tx.account_id ?? '',
      account_name: '',
      payment_method: '',
      destination_account_id: '',
      amount: String(Math.abs(tx.amount)),
      categoryId: tx.categoryId ?? '',
      date: tx.date.slice?.(0, 10) ?? tx.date,
      note: tx.note ?? '',
      payee: tx.payee ?? '',
      tags: Array.isArray(tx.tags) ? tx.tags.join(', ') : '',
    });
    setFormOpen(true);
  }

  async function parseQuickAdd() {
    if (!nlInput.trim() || nlLoading) return;
    setNlLoading(true);
    setError(null);
    const res = await fetch('/api/transactions/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: nlInput }),
    });
    const json = await res.json().catch(() => ({}));
    setNlLoading(false);
    if (!json.success) {
      setError(json.error || tf('txn.parseFailed', 'Gagal membaca input transaksi.'));
      return;
    }
    const parsed = json.data;
    setForm({
      type: parsed.type,
      account_id: parsed.accountId ?? '',
      account_name: parsed.accountName ?? '',
      payment_method: parsed.paymentMethod ?? '',
      destination_account_id: parsed.destinationAccountId ?? '',
      amount: parsed.amount ? String(parsed.amount) : '',
      categoryId: parsed.categoryId ?? '',
      date: parsed.date ?? emptyForm().date,
      note: parsed.note ?? '',
      payee: parsed.payee ?? '',
      tags: '',
    });
    setNlWarnings(parsed.warnings ?? []);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const amountNum = Number(form.amount);
    if (!form.account_id) {
      setError(t('txn.validation.accountRequired'));
      setSubmitting(false);
      return;
    }
    if (Number.isNaN(amountNum) || amountNum <= 0 || !Number.isInteger(amountNum)) {
      setError(t('txn.validation.amountInteger'));
      setSubmitting(false);
      return;
    }

    const normalizedTags = form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      account_id: form.account_id,
      ...(form.account_name ? {
        account_name: form.account_name,
        payment_method: form.payment_method || 'cash',
      } : {}),
      ...(form.type === 'transfer' && form.destination_account_id ? { destination_account_id: form.destination_account_id } : {}),
      type: form.type,
      amount: Math.round(amountNum),
      currency: 'IDR',
      categoryId: form.categoryId || null,
      date: form.date || businessDateString(),
      note: form.note || null,
      payee: form.payee || null,
      tags: normalizedTags,
    };

    const method = editingId ? 'PUT' : 'POST';
    const body = editingId ? { id: editingId, ...payload } : payload;
    const res = await fetch('/api/transactions', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!json.success) {
      setError(json.error || tf('txn.saveFailed', 'Gagal menyimpan transaksi.'));
      return;
    }
    setForm(emptyForm());
    setFormOpen(false);
    setEditingId(null);
    await loadTransactions();
  }

  async function removeTx(id: string) {
    setError(null);
    const res = await fetch('/api/transactions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error || tf('txn.deleteFailed', 'Gagal menghapus transaksi'));
      return;
    }
    await loadTransactions();
  }

  function fmtMoney(n: number) {
    return `Rp ${Math.abs(n).toLocaleString('id-ID')}`;
  }

  if (loading) return <p className="text-muted-foreground">{t('common.loading')}</p>;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-2xl font-medium">{t('txn.title')}</h2>
        <button
          type="button"
          onClick={() => {
            const nextOpen = !formOpen;
            setFormOpen(nextOpen);
            if (!nextOpen) {
              setEditingId(null);
              setForm(emptyForm());
              setNlInput('');
              setNlWarnings([]);
            }
          }}
          className="inline-flex items-center justify-center rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)]"
        >
          {formOpen ? t('common.cancel') : tf('dash.quickAdd', 'Tambah cepat')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="tx-account">{t('account.form.type')}</label>
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">{t('txn.filter.all')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {formOpen && (
        <>
          <div className="space-y-3 rounded-2xl border border-border bg-background/60 p-4">
            <div>
              <p className="text-sm font-semibold">{tf('txn.quickAdd.title', 'Quick Add')}</p>
              <p className="text-xs text-muted-foreground">{tf('txn.quickAdd.hint', 'Tulis satu transaksi, lalu periksa preview sebelum menyimpan.')}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={nlInput}
                onChange={(e) => setNlInput(e.target.value)}
                placeholder={tf('txn.quickAdd.placeholder', 'Contoh: gaji 5jt masuk BCA')}
                className="h-10 w-full sm:flex-1 rounded-lg border border-border bg-background px-3 text-sm"
              />
              <button type="button" onClick={parseQuickAdd} disabled={nlLoading || !nlInput.trim()} className="rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-60">
                {nlLoading ? t('common.loading') : tf('txn.quickAdd.preview', 'Buat preview')}
              </button>
            </div>
            {!!nlWarnings.length && <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">{nlWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          </div>
          <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-background/60 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><p className="text-sm font-semibold">{tf('txn.quickAdd.previewTitle', 'Preview transaksi, masih bisa diedit')}</p></div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <label className="text-xs text-muted-foreground" htmlFor="tx-type">{t('txn.type')}</label>
            <select
              id="tx-type"
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as TxType, categoryId: '' }))}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="expense">{t('txn.typeExpense')}</option>
              <option value="income">{t('txn.typeIncome')}</option>
              <option value="transfer">{t('txn.typeTransfer')}</option>
              <option value="adjustment">{t('txn.typeAdjustment')}</option>
            </select>

            <label className="text-xs text-muted-foreground" htmlFor="tx-account">{t('account.form.type')}</label>
            <select
              id="tx-account"
              value={form.account_id}
              onChange={(e) => setForm((prev) => ({ ...prev, account_id: e.target.value, account_name: '', payment_method: '' }))}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">{t('txn.validation.accountRequired')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>

          {form.type === 'transfer' && (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="tx-destination">{tf('txn.destinationAccount', 'Akun tujuan')}</label>
              <select id="tx-destination" value={form.destination_account_id} onChange={(e) => setForm((prev) => ({ ...prev, destination_account_id: e.target.value }))} className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm">
                <option value="">{tf('txn.destinationRequired', 'Pilih akun tujuan')}</option>
                {accounts.filter((a) => a.id !== form.account_id).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="tx-amount">{t('txn.amount')} (integer)</label>
            <input
              id="tx-amount"
              type="number"
              required
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="tx-date">{t('txn.dateLabel')}</label>
            <input
              id="tx-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="tx-category">{t('txn.category')}</label>
            <select
              id="tx-category"
              value={form.categoryId}
              onChange={(e) => setForm((prev) => ({ ...prev, categoryId: e.target.value }))}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
            >
              <option value="">{t('txn.type')}</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="tx-note">{t('txn.note')}</label>
            <input
              id="tx-note"
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="tx-payee">{t('txn.payee')}</label>
            <input
              id="tx-payee"
              value={form.payee}
              onChange={(e) => setForm((prev) => ({ ...prev, payee: e.target.value }))}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-muted-foreground" htmlFor="tx-tags">{t('txn.tags')}</label>
            <input
              id="tx-tags"
              value={form.tags}
              onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
              placeholder={t('txn.tagsPlaceholder')}
              className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            <button type="button" onClick={() => { setFormOpen(false); setEditingId(null); }} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-accent">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={submitting} className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60">
              {submitting ? t('common.loading') : editingId ? tf('txn.update', 'Perbarui') : t('txn.save')}
            </button>
          </div>
          </form>
        </>
      )}

      <div className="space-y-3">
        {rows.map((tx) => {
          const isExpense = tx.type === 'expense' || tx.amount < 0;
          return (
            <div key={tx.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
              <div className="min-w-0">
                <p className="font-medium capitalize text-foreground">{tx.type}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(tx.date).toLocaleString('id-ID')}
                  {tx.note ? ` · ${tx.note}` : ''}
                  {tx.payee ? ` · ${t('txn.payee')}: ${tx.payee}` : ''}
                  {tx.type === 'transfer' ? ` · ${t('txn.typeTransfer')}` : ''}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{tx.tags?.length ? tx.tags.join(', ') : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className={isExpense ? 'font-medium text-destructive' : 'font-medium text-income'}>
                  {fmtMoney(tx.amount)}
                </p>
                <button type="button" onClick={() => prefillForm(tx)} disabled={tx.type === 'transfer'} className="text-xs text-foreground hover:underline disabled:opacity-40 disabled:hover:no-underline">
                  {t('common.edit')}
                </button>
                <button type="button" onClick={() => removeTx(tx.id)} className="text-xs text-destructive hover:underline">
                  {t('common.delete')}
                </button>
              </div>
            </div>
          );
        })}
        {!rows.length && !loading && <p className="text-sm text-muted-foreground">{t('txn.noRecords')}</p>}
      </div>
    </section>
  );
}
