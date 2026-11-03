import { resolveAccountFromInput, type PaymentMethod } from './routing.ts';
import { businessDateString } from './datetime.ts';

export type NaturalAccount = {
  id: string;
  name: string;
  type: string;
  currency: string;
  createdAt: Date | string;
};

export type NaturalCategory = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
};

export type ParsedTransaction = {
  type: 'income' | 'expense' | 'transfer' | 'adjustment';
  amount: number | null;
  accountId: string | null;
  accountName: string | null;
  accountType: string | null;
  paymentMethod: PaymentMethod;
  destinationAccountId: string | null;
  categoryId: string | null;
  date: string;
  note: string;
  payee: string;
  warnings: string[];
};

const incomeWords = ['income', 'in', 'masuk', 'gaji', 'salary', 'bonus', 'pendapatan', 'terima'];
const expenseWords = ['expense', 'out', 'keluar', 'belanja', 'bayar', 'dinner', 'makan', 'listrik', 'bpjs'];
const transferWords = ['transfer', 'tf'];
const categoryAliases: Record<string, string[]> = {
  gaji: ['gaji pokok', 'salary'],
  salary: ['gaji pokok', 'salary'],
  bonus: ['bonus'],
  dinner: ['makan di luar'],
  makan: ['makan di luar'],
  listrik: ['listrik'],
  bpjs: ['bpjs'],
};

function normalize(value: string) {
  return value.toLocaleLowerCase('id-ID').replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
}

function hasWord(text: string, word: string) {
  return new RegExp(`(^|\\s|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|\\s|[^a-z0-9])`, 'i').test(text);
}

function parseAmount(input: string): { amount: number | null; raw: string | null } {
  const match = input.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(jt|juta|m|rb|ribu|k)?(?=\s|$|[^a-z])/i);
  if (!match) return { amount: null, raw: null };
  const number = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(number)) return { amount: null, raw: match[0] };
  const suffix = String(match[2] ?? '').toLowerCase();
  const multiplier = ['jt', 'juta', 'm'].includes(suffix) ? 1_000_000 : ['rb', 'ribu', 'k'].includes(suffix) ? 1_000 : 1;
  const amount = Math.round(number * multiplier);
  return { amount: amount > 0 ? amount : null, raw: match[0] };
}

function dateForInput(input: string, now: Date) {
  const date = /(^|\s)kemarin(\s|$)/i.test(input) ? new Date(now.getTime() - 86_400_000) : now;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function findAccount(input: string, accounts: NaturalAccount[]) {
  const text = normalize(input);
  return [...accounts]
    .filter((account) => {
      const escaped = normalize(account.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
    })
    .sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

function findCategory(input: string, type: string, categories: NaturalCategory[]) {
  const text = normalize(input);
  const candidates = categories.filter((category) => category.type === type);
  for (const [alias, names] of Object.entries(categoryAliases)) {
    if (!hasWord(text, alias)) continue;
    const match = candidates.find((category) => names.some((name) => normalize(category.name) === normalize(name)));
    if (match) return match;
  }
  return candidates.find((category) => hasWord(text, normalize(category.name))) ?? null;
}

export function parseNaturalTransaction(input: string, accounts: NaturalAccount[], categories: NaturalCategory[], now = new Date()): ParsedTransaction {
  const text = normalize(input);
  const { amount, raw: amountRaw } = parseAmount(text);
  const sourceText = text.split(/\b(?:ke|to)\b/i)[0];
  const explicitDestination = text.match(/\b(?:ke|to)\s+([^,;]+)/i)?.[1]?.trim();
  const destinationAccount = explicitDestination ? findAccount(explicitDestination, accounts) : null;
  const type = transferWords.some((word) => hasWord(text, word))
    ? 'transfer'
    : incomeWords.some((word) => hasWord(text, word))
      ? 'income'
      : 'expense';
  const routing = resolveAccountFromInput(sourceText, accounts);
  const account = routing.account;
  const category = findCategory(text, type, categories);
  const warnings: string[] = [];
  if (!amount) warnings.push('Nominal belum ditemukan.');
  if (!account) warnings.push(routing.error ?? 'Akun belum ditemukan.');
  if (type === 'transfer' && !destinationAccount) warnings.push('Akun tujuan belum ditemukan.');
  if (account && account.type === 'joint') warnings.push('Akun joint dipilih; pastikan ini memang tujuan transaksi.');
  if (account && account.type === 'credit_card' && type === 'income') warnings.push('Income ke kartu kredit perlu dikonfirmasi.');

  let note = text;
  if (amountRaw) note = note.replace(amountRaw, ' ');
  for (const accountCandidate of [account, destinationAccount]) {
    if (accountCandidate) note = note.replace(new RegExp(accountCandidate.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  }
  note = note.replace(/\b(?:hari ini|kemarin|today|yesterday|transfer|tf|income|expense|in|masuk|out|keluar|dari|from|ke|to)\b/gi, ' ').replace(/\s+/g, ' ').trim();

  return {
    type,
    amount,
    accountId: account?.id ?? null,
    accountName: account?.name ?? null,
    accountType: account?.type ?? null,
    paymentMethod: routing.method,
    destinationAccountId: destinationAccount?.id ?? null,
    categoryId: category?.id ?? null,
    date: dateForInput(text, now),
    note,
    payee: destinationAccount?.name ?? '',
    warnings,
  };
}
