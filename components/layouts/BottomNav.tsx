'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ArrowLeftRight, BarChart3, Wallet, Settings, Users } from 'lucide-react';
import { useLocale } from '@/lib/i18n/client';

const items = [
  { href: '/dashboard', labelKey: 'nav.dashboard', Icon: Home },
  { href: '/dashboard/transactions', labelKey: 'nav.transactions', Icon: ArrowLeftRight },
  { href: '/dashboard/reports', labelKey: 'nav.reports', Icon: BarChart3 },
  { href: '/dashboard/accounts', labelKey: 'nav.accounts', Icon: Wallet },
  { href: '/dashboard/users', labelKey: 'nav.users', Icon: Users },
  { href: '/dashboard/settings', labelKey: 'nav.settings', Icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLocale();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden" aria-label="Primary">
      <div className="mx-auto flex max-w-lg snap-x snap-mandatory items-end justify-start gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(({ href, labelKey, Icon }) => {
          const active = href === '/dashboard' ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);
          return <MobileItem key={href} href={href} label={t(labelKey)} Icon={Icon} active={active} />;
        })}
      </div>
    </nav>
  );
}

function MobileItem({ href, label, Icon, active }: { href: string; label: string; Icon: typeof Home; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={`flex min-w-[72px] shrink-0 snap-start flex-col items-center gap-1 rounded-2xl px-1 py-1 text-[10px] font-bold transition ${active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
      <Icon strokeWidth={active ? 2.2 : 1.7} className="h-5 w-5" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}
