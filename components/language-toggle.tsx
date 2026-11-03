'use client';

import { useLocale } from '@/lib/i18n/client';

export function LanguageSegmentedControl({ className }: { className?: string }) {
  const { locale, setLocale, tf } = useLocale();

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-heading text-xl font-medium">{tf('settings.language.title', 'Language')}</h3>
          <p className="text-xs text-muted-foreground">{tf('settings.language.desc', 'Choose the interface language. Saved on this device.')}</p>
        </div>
        <div
          className="seg flex items-center gap-1 rounded-xl border border-border bg-surface p-0.5"
          role="group"
          aria-label={tf('settings.language.toggle', 'Change language')}
        >
          <button
            type="button"
            aria-pressed={locale === 'id'}
            onClick={() => setLocale('id')}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm aria-pressed:bg-foreground aria-pressed:text-background"
          >
            <span>🇮🇩</span>
            <span>ID</span>
          </button>
          <button
            type="button"
            aria-pressed={locale === 'en'}
            onClick={() => setLocale('en')}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm aria-pressed:bg-foreground aria-pressed:text-background"
          >
            <span>🇬🇧</span>
            <span>EN</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function LanguageHeaderPill() {
  const { locale, setLocale, tf } = useLocale();

  return (
    <button
      type="button"
      onClick={() => setLocale(locale === 'id' ? 'en' : 'id')}
      className="pill"
      aria-label={tf('settings.language.toggle', 'Change language')}
    >
      <span aria-hidden>{locale === 'id' ? '🇮🇩' : '🇬🇧'}</span>
      <span>{locale.toUpperCase()}</span>
    </button>
  );
}
