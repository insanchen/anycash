'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/lib/i18n/client';
import { BrandLogo } from '@/components/BrandLogo';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || t('login.failed'));
        setLoading(false);
        return;
      }
      router.replace('/dashboard');
    } catch {
      setError(t('login.networkError'));
      setLoading(false);
    }
  }

  return (
    <main className="login-page min-h-screen bg-background text-foreground">
      <section className="login-welcome hidden min-h-screen flex-col justify-between overflow-hidden bg-primary-dark px-[8vw] py-[8vh] text-primary-foreground lg:flex">
        <div className="flex items-center gap-3 text-xl font-bold">
          <BrandLogo className="h-10" />
        </div>
        <div className="relative z-10 max-w-md">
          <p className="mb-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-sage-highlight">
            {t('login.eyebrow')}
          </p>
          <h1 className="font-heading text-6xl font-semibold leading-[0.98] tracking-[-0.04em]">
            {t('login.heroTitle')}
          </h1>
          <p className="mt-6 max-w-sm text-base text-primary-foreground/80">{t('login.heroBody')}</p>
        </div>
        <p className="relative z-10 font-heading text-sm italic text-sage-highlight">{t('login.heroFoot')}</p>
      </section>

      <section className="login-form-side flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:px-[7vw]">
        <form onSubmit={onSubmit} action="/api/auth/login" method="POST" className="w-full max-w-sm space-y-5">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandLogo className="h-9" />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">{t('login.eyebrow')}</p>
            <h2 className="font-heading text-4xl font-semibold tracking-[-0.04em]">{t('login.title')}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t('login.subtitle')}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-foreground" htmlFor="email">{t('login.email')}</label>
            <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-foreground" htmlFor="password">{t('login.password')}</label>
              <a className="text-xs font-bold text-primary-dark underline-offset-2 hover:underline" href="#">{t('login.forgot')}</a>
            </div>
            <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" />
          </div>

          {error && <p role="alert" className="rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}

          <button type="submit" disabled={loading} className="w-full rounded-full bg-primary px-3 py-3 text-sm font-extrabold text-primary-foreground hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? t('common.loading') : t('login.submit')}
          </button>

          <div className="flex gap-2 rounded-xl bg-secondary px-3 py-3 text-xs text-secondary-foreground">
            <span aria-hidden="true">◌</span>
            <span>{t('login.privacy')}</span>
          </div>
          <p className="text-center text-xs text-muted-foreground">{t('login.language')}: <strong className="text-primary-dark">ID</strong> · EN</p>
        </form>
      </section>
    </main>
  );
}
