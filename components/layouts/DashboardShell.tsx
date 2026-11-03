import { BrandLogo } from '@/components/BrandLogo';
import { LanguageHeaderPill } from '@/components/language-toggle';
import { NavLinks } from '@/app/dashboard/NavLinks';
import { BottomNav } from '@/components/layouts/BottomNav';
import { AuthSessionKeepAlive } from '@/components/auth/AuthSessionKeepAlive';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AuthSessionKeepAlive />
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface px-5 py-7 lg:flex">
        <BrandLogo className="h-9" />
        <p className="mt-12 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">AnyCash</p>
        <NavLinks />
        <div className="mt-auto rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">
          <p className="font-heading text-lg">Quiet balance.</p>
          <p className="mt-1 text-xs leading-relaxed opacity-80">A clearer view of what matters today.</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/80 bg-background/90 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="lg:hidden"><BrandLogo className="h-8" /></div>
          <div className="hidden lg:block"><p className="text-xs text-muted-foreground">Your personal finance space</p></div>
          <LanguageHeaderPill />
        </header>
        <main className="mx-auto max-w-7xl px-5 py-7 pb-28 sm:px-8 lg:px-10 lg:py-10 lg:pb-10">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
