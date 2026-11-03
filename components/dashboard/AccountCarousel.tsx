'use client';

import { useEffect, useRef, useState } from 'react';

type Account = {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  creditLimit: number | null;
};

type Props = {
  accounts: Account[];
  title: string;
  seeAll: string;
  previous: string;
  next: string;
  labels: { personal: string; joint: string; creditCard: string; debt: string; available: string };
};

export default function AccountCarousel({ accounts, title, seeAll, previous, next, labels }: Props) {
  const [desktopStart, setDesktopStart] = useState(0);
  const mobileRail = useRef<HTMLDivElement>(null);
  const maxDesktopStart = Math.max(accounts.length - 4, 0);

  useEffect(() => {
    setDesktopStart((current) => Math.min(current, maxDesktopStart));
  }, [maxDesktopStart]);

  const moveMobile = (direction: 1 | -1) => {
    mobileRail.current?.scrollBy({ left: direction * (mobileRail.current.clientWidth * 0.88), behavior: 'smooth' });
  };

  const typeLabel = (type: string) => type === 'credit_card' ? labels.creditCard : type === 'joint' ? labels.joint : labels.personal;

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-[28px] border border-border bg-surface p-5 shadow-card sm:p-7" aria-labelledby="dashboard-accounts-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{Math.min(desktopStart + 1, accounts.length)}–{Math.min(desktopStart + 4, accounts.length)} / {accounts.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setDesktopStart((current) => Math.max(current - 1, 0)); moveMobile(-1); }} disabled={!accounts.length || desktopStart === 0} aria-label={previous} className="rounded-full border border-border px-3 py-1.5 text-sm font-bold transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-35">←</button>
          <button type="button" onClick={() => { setDesktopStart((current) => Math.min(current + 1, maxDesktopStart)); moveMobile(1); }} disabled={!accounts.length || desktopStart === maxDesktopStart} aria-label={next} className="rounded-full border border-border px-3 py-1.5 text-sm font-bold transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-35">→</button>
          <a href="/dashboard/accounts" className="ml-1 text-xs font-bold text-primary-dark hover:underline">{seeAll}</a>
        </div>
      </div>

      {accounts.length ? (
        <>
          <div className="mt-5 hidden min-w-0 gap-3 md:grid md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            {accounts.slice(desktopStart, desktopStart + 4).map((account) => <AccountCard key={account.id} account={account} typeLabel={typeLabel(account.type)} labels={labels} />)}
          </div>
          <div ref={mobileRail} className="mt-5 flex min-w-0 max-w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:hidden" aria-label={title}>
            {accounts.map((account) => <div key={account.id} className="w-[calc(100%-2rem)] max-w-[360px] shrink-0 snap-start"><AccountCard account={account} typeLabel={typeLabel(account.type)} labels={labels} /></div>)}
          </div>
        </>
      ) : <p className="mt-5 rounded-2xl bg-background p-4 text-sm text-muted-foreground">—</p>}
    </section>
  );
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function AccountCard({ account, typeLabel, labels }: { account: Account; typeLabel: string; labels: Props['labels'] }) {
  const isCard = account.type === 'credit_card';
  const available = account.creditLimit == null ? null : Math.max(0, Number(account.creditLimit) + Number(account.balance));
  return (
    <article className={`min-h-[142px] min-w-0 rounded-2xl p-4 ${isCard ? 'bg-primary-dark text-primary-foreground' : account.type === 'joint' ? 'bg-secondary' : 'bg-background'}`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-bold">{account.name}</p><p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.12em] opacity-65">{typeLabel} · {account.currency}</p></div>
        {account.type === 'joint' && <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-bold">Joint</span>}
      </div>
      <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.12em] opacity-65">{isCard ? labels.debt : typeLabel}</p>
      <p className="mt-1 break-words font-heading text-[clamp(1rem,2.5vw,1.25rem)] font-semibold leading-tight tracking-[-0.03em]">{formatMoney(isCard ? Math.max(0, -Number(account.balance)) : Number(account.balance), account.currency)}</p>
      {isCard && available != null && <p className="mt-1 text-xs opacity-70">{labels.available}: {formatMoney(available, account.currency)}</p>}
    </article>
  );
}
