'use client';

import React from 'react';
import { useLocale } from '@/lib/i18n/client';
import { LanguageSegmentedControl } from '@/components/language-toggle';
import { useTheme } from '@/lib/theme';

type CategoryRow = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  isDefault: boolean;
  isHidden: boolean;
  createdAt: string;
};

type Category = CategoryRow & { children?: Category[] };

export function CategoryManagement() {
  const { t, tf } = useLocale();
  const TYPES = ['income', 'expense', 'transfer', 'adjustment'] as const;
  const [rows, setRows] = React.useState<Category[]>([]);
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [form, setForm] = React.useState({ name: '', type: 'expense', parentId: '' });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setStatus(null);
    const res = await fetch('/api/admin/categories', { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (json.success) setRows(json.data ?? []);
    else setStatus(tf('settings.loadCategoriesFailed', 'Tidak bisa memuat kategori'));
  }, [tf]);

  React.useEffect(() => { void load(); }, [load]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, Category>();
    const nest = (item: CategoryRow) => {
      const node: Category = { ...item, children: [] };
      map.set(item.id, node);
      return node;
    };
    const roots: Category[] = [];
    for (const row of rows) {
      const node = nest(row);
      if (row.parentId) {
        const parent = map.get(row.parentId);
        if (parent) parent.children!.push(node); else roots.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }, [rows]);

  const roots = React.useMemo(() => grouped.filter((node) => !node.parentId), [grouped]);

  async function createCategory() {
    setBusy(true);
    setStatus(null);
    const name = form.name.trim();
    const type = form.type;
    const parentId = form.parentId || undefined;
    if (!name) {
      setStatus(t('settings.invalidName'));
      setBusy(false);
      return;
    }
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, parentId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.success) {
      setStatus(tf('settings.createFailed', 'Gagal menambah kategori'));
      setBusy(false);
      return;
    }
    setForm((prev) => ({ ...prev, name: '' }));
    await load();
    setBusy(false);
  }

  async function renameCategory(id: string, name: string) {
    setBusy(true);
    setStatus(null);
    const res = await fetch('/api/admin/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.success) setStatus(tf('settings.updateFailed', 'Gagal memperbarui'));
    else setEditingId(null);
    setBusy(false);
  }

  async function toggleHidden(id: string, isHidden: boolean) {
    setBusy(true);
    setStatus(null);
    const res = await fetch('/api/admin/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isHidden: !isHidden }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.success) setStatus(tf('settings.updateFailed', 'Gagal memperbarui'));
    else await load();
    setBusy(false);
  }

  async function deleteCategory(id: string) {
    if (!confirm(t('settings.deleteConfirm'))) return;
    setBusy(true);
    setStatus(null);
    const res = await fetch('/api/admin/categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.success) {
      setStatus(tf('settings.deleteFailed', 'Gagal menghapus kategori'));
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  function NodeRow({ node, depth }: { node: Category; depth: number }) {
    const children = node.children ?? [];
    return (
      <div style={{ marginLeft: Math.min(depth, 6) * 18 }}>
        <div className="rounded-2xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">{node.name}</p>
              <p className="text-xs text-muted-foreground">
                {node.type} · {node.isDefault ? t('settings.default') : t('settings.custom')} · {node.isHidden ? t('settings.hidden') : t('settings.visible')} · {children.length} {t('settings.child')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => toggleHidden(node.id, node.isHidden)} className="rounded-2xl border border-border px-3 py-2 text-xs">{node.isHidden ? t('settings.show') : t('settings.hide')}</button>
              {!node.isDefault && children.length === 0 && (
                <>
                  {editingId === node.id ? (
                    <span className="flex items-center gap-2">
                      <input autoFocus value={editingName} onChange={(e) => setEditingName(e.target.value)} className="rounded-2xl border border-border bg-background px-3 py-2 text-sm" />
                      <button type="button" disabled={busy} onClick={() => renameCategory(node.id, editingName)} className="rounded-2xl bg-primary px-3 py-2 text-xs text-primary-foreground">{t('settings.save')}</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-2xl border border-border px-3 py-2 text-xs">{t('settings.cancel')}</button>
                    </span>
                  ) : (
                    <>
                      <button type="button" onClick={() => { setEditingId(node.id); setEditingName(node.name); }} className="rounded-2xl border border-border px-3 py-2 text-xs">{t('settings.edit')}</button>
                      <button type="button" disabled={busy} onClick={() => deleteCategory(node.id)} className="rounded-2xl border border-border px-3 py-2 text-xs">{t('settings.delete')}</button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        {children.map((child) => (
          <NodeRow key={child.id} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  const visibleNodeIds = React.useMemo(() => buildVisibleNodeIds(rows, typeFilter), [rows, typeFilter]);
  const visibleRoots = React.useMemo(() => roots.filter((node) => canRender(node, visibleNodeIds)), [roots, visibleNodeIds]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-xl font-medium">{t('settings.categories')}</h3>
        <div className="flex gap-2">
          {[t('settings.categoryTypeAll'), ...TYPES].map((type) => (
            <button key={type} type="button" onClick={() => setTypeFilter(type.toLowerCase().startsWith('all') || type === t('settings.categoryTypeAll') ? 'all' : type.toLowerCase())} className={`rounded-2xl border border-border px-3 py-2 text-xs capitalize ${typeFilter === (type === t('settings.categoryTypeAll') ? 'all' : type.toLowerCase()) ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}>
              {type}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.categoriesHelper')}</p>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {visibleRoots.length ? (
        <div className="space-y-2">{visibleRoots.map((root) => <NodeRow key={root.id} node={root} depth={0} />)}</div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('settings.categoryEmpty')}</p>
      )}
      <div className="rounded-2xl border border-border bg-surface p-3">
        <p className="text-sm font-medium mb-2">{t('settings.addCustomCategory')}</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_120px_1fr_auto]">
          <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder={t('settings.categoryNamePlaceholder')} className="rounded-2xl border border-border bg-background px-3 py-2 text-sm" />
          <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} className="rounded-2xl border border-border bg-background px-3 py-2 text-sm capitalize">
            {TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <input value={form.parentId} onChange={(e) => setForm((prev) => ({ ...prev, parentId: e.target.value }))} placeholder={t('settings.parentIdPlaceholder')} className="rounded-2xl border border-border bg-background px-3 py-2 text-sm" />
          <button type="button" disabled={busy} onClick={createCategory} className="rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">{busy ? t('settings.saving') : t('settings.add')}</button>
        </div>
      </div>
    </div>
  );
}

function buildVisibleNodeIds(nodes: CategoryRow[], typeFilter: string) {
  const map = new Map<string, string[]>();
  for (const node of nodes) {
    const children = nodes.filter((n) => n.parentId === node.id);
    map.set(node.id, children.map((child) => child.id));
  }
  const visible = new Set<string>();
  for (const node of nodes) {
    if (typeFilter === 'all' || node.type === typeFilter) visible.add(node.id);
  }
  for (const node of nodes) {
    if (typeFilter !== 'all' && node.type !== typeFilter) {
      queueChildIds(node.id);
    }
  }
  function queueChildIds(id: string) {
    for (const childId of map.get(id) ?? []) {
      visible.delete(childId);
      queueChildIds(childId);
    }
  }
  return visible;
}

function canRender(node: CategoryRow & { children?: CategoryRow[] }, visibleIds: Set<string>): boolean {
  return visibleIds.has(node.id) || (node.children ?? []).some((child) => canRender(child, visibleIds));
}

type ApiKeyRow = { id: string; keyPrefix: string; name: string; scopes: string[]; rateLimit: number; revokedAt: string | null; createdAt: string };
const SCOPES = ['transactions:read', 'transactions:write', 'accounts:read', 'accounts:write', 'categories:read', 'categories:write', 'backup:read', 'backup:write'];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 rounded-2xl border border-border bg-surface p-5"><h3 className="font-heading text-xl font-medium">{title}</h3>{children}</section>;
}

export default function SettingsClient() {
  const { t, tf } = useLocale();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = React.useState({ email: '', username: '' });
  const [rateSource, setRateSource] = React.useState('manual');
  const [keys, setKeys] = React.useState<ApiKeyRow[]>([]);
  const [keyName, setKeyName] = React.useState('');
  const [keyScopes, setKeyScopes] = React.useState<string[]>(['transactions:read']);
  const [newKey, setNewKey] = React.useState<string | null>(null);
  const [passwords, setPasswords] = React.useState({ currentPassword: '', newPassword: '' });
  const [backupFile, setBackupFile] = React.useState<File | null>(null);
  const [restorePreview, setRestorePreview] = React.useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<{ id: string; createdAt: string }[]>([]);

  const api = React.useCallback(async (url: string, init?: RequestInit) => {
    const res = await fetch(url, init); const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.error || 'Request failed');
    return json.data;
  }, []);

  const load = React.useCallback(async () => {
    try {
      const [p, s, k, activeSessions] = await Promise.all([api('/api/profile'), api('/api/settings'), api('/api/api-keys'), api('/api/sessions')]);
      setProfile({ email: p.email ?? '', username: p.username ?? '' }); setRateSource(s.rateSource ?? 'manual'); setKeys(k ?? []); setSessions(activeSessions ?? []);
    } catch (e) { setStatus(e instanceof Error ? e.message : tf('common.error', 'Something went wrong.')); }
  }, [api, tf]);
  React.useEffect(() => { load(); }, [load]);

  async function saveProfile() { try { const p = await api('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: profile.username }) }); setProfile({ email: p.email, username: p.username ?? '' }); setStatus(tf('settings.saved', 'Saved.')); } catch (e) { setStatus(e instanceof Error ? e.message : 'Failed'); } }
  async function saveRate() { try { await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rateSource }) }); setStatus(tf('settings.saved', 'Saved.')); } catch (e) { setStatus(e instanceof Error ? e.message : 'Failed'); } }
  async function changePassword() { try { await api('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(passwords) }); setPasswords({ currentPassword: '', newPassword: '' }); setStatus(tf('settings.passwordChanged', 'Password changed. Please sign in again on other devices.')); await load(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Failed'); } }
  async function revokeSessions() { try { await api('/api/sessions', { method: 'DELETE' }); setSessions([]); setStatus(tf('settings.sessionsRevoked', 'All sessions were revoked.')); } catch (e) { setStatus(e instanceof Error ? e.message : 'Failed'); } }
  async function createKey() { try { const data = await api('/api/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: keyName, scopes: keyScopes, rateLimit: 100 }) }); setNewKey(data.key); setKeyName(''); await load(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Failed'); } }
  async function revokeKey(id: string) { try { await api('/api/api-keys', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); await load(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Failed'); } }
  async function downloadBackup() { const res = await fetch('/api/backup'); if (!res.ok) { setStatus('Backup failed'); return; } const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = 'anycash-backup.json.gz'; a.click(); URL.revokeObjectURL(url); }
  async function previewBackup() { if (!backupFile) return; try { const data = await api('/api/backup', { method: 'POST', body: (() => { const f = new FormData(); f.set('file', backupFile); return f; })() }); setRestorePreview(data); } catch (e) { setStatus(e instanceof Error ? e.message : 'Failed'); } }
  async function applyRestore() { if (!backupFile) return; try { await api('/api/backup?confirm=true', { method: 'POST', body: (() => { const f = new FormData(); f.set('file', backupFile); return f; })() }); setRestorePreview(null); setBackupFile(null); setStatus(tf('settings.restoreDone', 'Restore completed.')); await load(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Failed'); } }

  return <div className="space-y-6">
    {status && <p className="rounded-xl border border-border bg-background p-3 text-sm">{status}</p>}
    <Card title={tf('settings.profile', 'Profile')}><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">{tf('common.email', 'Email')}<input disabled value={profile.email} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 opacity-70" /></label><label className="text-sm">{tf('common.username', 'Name')}<input value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2" /></label></div><button onClick={saveProfile} className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">{tf('common.save', 'Save')}</button></Card>
    <LanguageSegmentedControl />
    <Card title={tf('settings.theme', 'Theme')}><div className="flex flex-wrap gap-2">{(['light', 'dark', 'system'] as const).map((item) => <button key={item} onClick={() => setTheme(item)} aria-pressed={theme === item} className="rounded-xl border border-border px-3 py-2 text-sm capitalize aria-pressed:bg-foreground aria-pressed:text-background">{item}</button>)}</div></Card>
    <Card title={tf('settings.rateSource.title', 'Rate source')}><p className="text-sm text-muted-foreground">{tf('settings.rateSource.desc', 'Choose the conversion source used for multi-currency conversion.')}</p><div className="flex gap-2"><select value={rateSource} onChange={(e) => setRateSource(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2"><option value="manual">Manual</option><option value="open_er">Open ER</option><option value="exchangerate-host">ExchangeRate Host</option><option value="currencylayer">Currencylayer</option><option value="fixer">Fixer</option></select><button onClick={saveRate} className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">{tf('common.save', 'Save')}</button></div></Card>
    <Card title={tf('settings.security', 'Security')}><div className="grid gap-2 sm:grid-cols-2"><input type="password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} placeholder={tf('settings.currentPassword', 'Current password')} className="rounded-xl border border-border bg-background px-3 py-2"/><input type="password" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} placeholder={tf('settings.newPassword', 'New password (min. 8 characters)')} className="rounded-xl border border-border bg-background px-3 py-2"/></div><button onClick={changePassword} className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">{tf('settings.changePassword', 'Change password')}</button><p className="text-sm text-muted-foreground">{sessions.length} {tf('settings.activeSessions', 'active session(s)')}</p><button onClick={revokeSessions} className="rounded-xl border border-border px-3 py-2 text-sm">{tf('settings.revokeSessions', 'Sign out all sessions')}</button></Card>
    <Card title={tf('settings.apiKeys', 'API keys')}><p className="text-sm text-muted-foreground">{tf('settings.apiKeysHint', 'Create a key once; its full value is shown only now.')}</p>{newKey && <code className="block break-all rounded-xl bg-background p-3 text-xs">{newKey}</code>}<div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder={tf('settings.apiKeyName', 'Key name')} className="rounded-xl border border-border bg-background px-3 py-2"/><button onClick={createKey} className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">{tf('settings.generateKey', 'Generate key')}</button></div><div className="flex flex-wrap gap-2">{SCOPES.map((scope) => <label key={scope} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={keyScopes.includes(scope)} onChange={() => setKeyScopes(keyScopes.includes(scope) ? keyScopes.filter((s) => s !== scope) : [...keyScopes, scope])}/>{scope}</label>)}</div><div className="space-y-2">{keys.map((key) => <div key={key.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"><span>{key.name} · <code>{key.keyPrefix}…</code>{key.revokedAt ? ' · revoked' : ''}</span>{!key.revokedAt && <button onClick={() => revokeKey(key.id)} className="text-destructive">{tf('settings.revoke', 'Revoke')}</button>}</div>)}</div></Card>
    <Card title={tf('settings.backup', 'Backup')}><p className="text-sm text-muted-foreground">{tf('settings.backupHint', 'Download a gzipped JSON backup or preview a restore before applying it.')}</p><button onClick={downloadBackup} className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">{tf('settings.downloadBackup', 'Download backup')}</button>{restorePreview && <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{tf('settings.restoreWarning', 'Warning: restoring overwrites matching records and can replace account password hashes. Confirm only after reviewing this preview.')}</p>}<div className="flex flex-wrap gap-2"><input type="file" accept="application/gzip,application/json,.gz,.json" onChange={(e) => { setBackupFile(e.target.files?.[0] ?? null); setRestorePreview(null); }} /><button disabled={!backupFile} onClick={previewBackup} className="rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50">{tf('settings.previewRestore', 'Preview restore')}</button>{restorePreview && <button onClick={applyRestore} className="rounded-xl bg-destructive px-3 py-2 text-sm text-white">{tf('settings.confirmRestore', 'Confirm restore')}</button>}</div>{restorePreview && <pre className="overflow-auto rounded-xl bg-background p-3 text-xs">{JSON.stringify(restorePreview, null, 2)}</pre>}</Card>
    <CategoryManagement />
    <Card title={tf('settings.about', 'About')}><p className="text-sm text-muted-foreground">AnyCash v1.0 · Privacy-first personal finance</p></Card>
  </div>;
}
