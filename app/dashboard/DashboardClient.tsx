'use client';

import * as React from 'react';
import { useLocale } from '@/lib/i18n/client';

export default function DashboardClient() {
  const { t } = useLocale();
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-medium">{t('dash.totalBalance')}</h2>
      <p className="text-muted-foreground">{t('common.loading') || 'Memuat...'}</p>
    </section>
  );
}
