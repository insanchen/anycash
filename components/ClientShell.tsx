'use client';

import { type ReactNode } from 'react';
import { LocaleProvider } from '@/lib/i18n/client';
import { ThemeProvider } from '@/lib/theme';
import { DEFAULT_LANGUAGE, type Locale } from '@/lib/i18n/index';

type ClientShellProps = {
  children: ReactNode;
  initialLocale?: Locale;
};

export function ClientShell({ children, initialLocale = DEFAULT_LANGUAGE }: ClientShellProps) {
  return (
    <ThemeProvider>
      <LocaleProvider initialLocale={initialLocale}>{children}</LocaleProvider>
    </ThemeProvider>
  );
}
