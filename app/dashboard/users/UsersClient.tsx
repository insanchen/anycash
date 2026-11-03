'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocale } from '@/lib/i18n/client';

type User = {
  id: string;
  email: string;
  username: string | null;
  role: string;
  createdAt: string;
};

type Mode = 'create' | 'edit' | null;

const emptyForm = () => ({ email: '', username: '', password: '', role: 'member' });
const cleanUser = (u: User) => ({ id: u.id, email: u.email, username: u.username, role: u.role, createdAt: u.createdAt });

export default function UsersClient() {
  const { t } = useLocale();
  const [rows, setRows] = useState<User[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [form, setForm] = useState(() => emptyForm());
  const [currentPassword, setCurrentPassword] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const readForm = useCallback((partial: Partial<typeof form> = {}) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/users', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (json.success) setRows((json.data ?? []).map(cleanUser));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, string> = { email: form.email, role: form.role };
      if (form.username) payload.username = form.username;
      if (editingId) {
        const selfEdit = rows.length === 1 && rows[0].id === editingId && rows[0].role === 'member';
        if (selfEdit) {
          const profileRes = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.username }) });
          const profileJson = await profileRes.json().catch(() => ({}));
          if (!profileJson.success) throw new Error(profileJson.error || t('common.updateFailed'));
          if (form.password) {
            const passwordRes = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword: form.password }) });
            const passwordJson = await passwordRes.json().catch(() => ({}));
            if (!passwordJson.success) throw new Error(passwordJson.error || t('common.updateFailed'));
          }
          setRows((prev) => prev.map((r) => (r.id === editingId ? { ...r, username: profileJson.data.username ?? null } : r)));
        } else {
          const res = await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingId, ...payload }) });
          const json = await res.json().catch(() => ({}));
          if (!json.success) throw new Error(json.error || t('common.updateFailed'));
          setRows((prev) => prev.map((r) => (r.id === editingId ? cleanUser(json.data) : r)));
        }
        setMode(null);
        setEditingId(null);
      } else {
        if (!form.password) throw new Error(t('common.password'));
        const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, password: form.password }) });
        const json = await res.json().catch(() => ({}));
        if (!json.success) throw new Error(json.error || t('common.createFailed'));
        setRows((prev) => [cleanUser(json.data), ...prev]);
        setMode(null);
      }
      setForm(emptyForm());
      setCurrentPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) });
      const json = await res.json().catch(() => ({}));
      if (!json.success) throw new Error(json.error || t('common.deleteFailed'));
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeleting(false);
    }
  }

  const startCreate = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm());
    setCurrentPassword('');
    setMode('create');
  }, []);

  const startEdit = useCallback((u: User) => {
    setEditingId(u.id);
    setForm({ email: u.email, username: u.username ?? '', password: '', role: u.role });
    setCurrentPassword('');
    setMode('edit');
  }, []);

  const isCreate = mode === 'create';
  const title = isCreate ? t('common.addUser') : mode === 'edit' ? t('common.edit') : t('common.users');
  const currentRole = rows.length === 1 ? rows[0].role : rows.find((row) => row.role === 'owner') ? 'owner' : 'admin';
  const canManageUsers = currentRole === 'owner' || currentRole === 'admin';
  const isSelfEditing = Boolean(editingId && !canManageUsers);
  const roleLabel = (role: string) => role === 'owner' ? t('role.owner') : role === 'admin' ? t('role.admin') : t('role.user');

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-2xl font-medium">{title}</h2>
        {!mode && canManageUsers && (
          <button type="button" onClick={startCreate} className="rounded-2xl border border-border px-3 py-2 text-sm hover:text-foreground">
            + {t('common.addUser')}
          </button>
        )}
      </div>

      {mode && (
        <form onSubmit={submit} className="grid gap-2 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={form.email}
            onChange={(e) => readForm({ email: e.target.value })}
            placeholder={t('common.email')}
            required
            disabled={isSelfEditing}
            className="rounded-2xl border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.username}
            onChange={(e) => readForm({ username: e.target.value })}
            placeholder={t('common.username')}
            className="rounded-2xl border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={form.password}
            onChange={(e) => readForm({ password: e.target.value })}
            placeholder={isSelfEditing ? `${t('common.password')} (new, optional)` : t('common.password')}
            required={isCreate}
            className="rounded-2xl border border-border bg-background px-3 py-2 text-sm"
          />
          {isSelfEditing && (
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={`${t('common.password')} (current)`}
              required={Boolean(form.password)}
              className="rounded-2xl border border-border bg-background px-3 py-2 text-sm"
            />
          )}
          <select
            value={form.role}
            onChange={(e) => readForm({ role: e.target.value })}
            disabled={isSelfEditing}
            className="rounded-2xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="member">{t('role.user')}</option>
            <option value="admin">{t('role.admin')}</option>
            {currentRole === 'owner' && <option value="owner">{t('role.owner')}</option>}
          </select>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
              {saving ? t('common.loading') : t('common.save')}
            </button>
            <button type="button" onClick={() => { setMode(null); setEditingId(null); }} className="rounded-2xl border border-border px-3 py-2 text-sm">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">{t('common.noUsers')}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((u) => (
            <div key={u.id} className="flex flex-col gap-4 rounded-[24px] border border-border bg-surface p-4 shadow-card transition hover:border-primary/50 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary font-heading text-lg font-semibold text-primary-dark">{(u.username || u.email).slice(0, 1).toUpperCase()}</div>
                <div>
                  <p className="font-semibold text-foreground">{u.username || u.email.split('@')[0]}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t('common.createdAt')}: {new Date(u.createdAt).toLocaleString('id-ID')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-secondary-foreground">{roleLabel(u.role)}</span>
                {(canManageUsers || u.id === rows[0]?.id) && <button type="button" onClick={() => startEdit(u)} className="rounded-2xl border border-border px-3 py-2 text-xs">{t('common.edit')}</button>}
                {canManageUsers && u.email !== 'admin@anycash.local' && (
                  <button type="button" onClick={() => setDeleteTarget(u)} className="rounded-2xl border border-border px-3 py-2 text-xs text-red-400">{t('common.delete')}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-background p-4">
            <p className="text-sm">{t('common.dropConfirm')}</p>
            <div className="flex gap-2">
              <button type="button" disabled={deleting} onClick={confirmDelete} className="rounded-2xl bg-red-500 px-3 py-2 text-sm text-white">
                {deleting ? t('common.loading') : t('common.confirmDelete')}
              </button>
              <button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} className="rounded-2xl border border-border px-3 py-2 text-sm">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
