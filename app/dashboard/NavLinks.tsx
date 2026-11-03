'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ArrowLeftRight, BarChart3, Wallet, Users, Settings } from 'lucide-react';
import { useLocale } from '@/lib/i18n/client';

const navItems = [
  { href: '/dashboard', labelKey: 'nav.dashboard', Icon: Home },
  { href: '/dashboard/transactions', labelKey: 'nav.transactions', Icon: ArrowLeftRight },
  { href: '/dashboard/reports', labelKey: 'nav.reports', Icon: BarChart3 },
  { href: '/dashboard/accounts', labelKey: 'nav.accounts', Icon: Wallet },
  { href: '/dashboard/users', labelKey: 'nav.users', Icon: Users },
  { href: '/dashboard/settings', labelKey: 'nav.settings', Icon: Settings },
];

export function NavLinks() {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <nav className="mt-3 flex flex-col gap-1 text-sm">
      {navItems.map(({ href, labelKey, Icon }) => {
        const active = href === '/dashboard' ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold transition ${active ? 'bg-secondary text-primary-dark' : 'text-muted-foreground hover:bg-background hover:text-foreground'}`}>
            <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.7} aria-hidden />
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
