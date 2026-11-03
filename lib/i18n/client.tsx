'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { t as tByLocale, type Locale } from './index';

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string) => string;
  tf: (key: string, fallback: string) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function LocaleProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const router = useRouter();

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', next);
      fetch('/api/settings/locale', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      }).finally(() => router.refresh());
    }
  };

  const t = useCallback((key: string, fallback?: string) => tByLocale(locale, key, fallback), [locale]);
  const tf = useCallback((key: string, fallback: string) => {
    const raw = tByLocale(locale, key);
    return raw && raw !== key ? raw : fallback;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, tf }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
