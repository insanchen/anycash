export type PaymentMethod = 'credit_card' | 'bank_transfer' | 'cash';

export type RoutableAccount = {
  id: string;
  name: string;
  type: string;
};

export type PaymentMethodDetection = {
  method: PaymentMethod | null;
  explicit: boolean;
  error?: string;
};

export type AccountRoutingResult = {
  method: PaymentMethod;
  account: RoutableAccount | null;
  error?: string;
};

const CREDIT_CARD_WORDS = ['cc', 'credit', 'credit card'];
const BANK_TRANSFER_WORDS = ['tf', 'transfer', 'qris'];
const CASH_WORDS = ['cash', 'tunai'];

function normalize(value: string) {
  return value.toLocaleLowerCase('id-ID').replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
}

function hasWord(text: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s|[^a-z0-9])${escaped}(?=$|\\s|[^a-z0-9])`, 'i').test(text);
}

function hasPhrase(text: string, phrase: string) {
  return text.includes(normalize(phrase));
}

function containsAccountName(text: string, name: string) {
  const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
}

function accountNameWithoutCardPrefix(name: string) {
  return normalize(name).replace(/^(?:cc|credit card)\s+/, '').trim();
}

export function normalizePaymentMethod(value: unknown): PaymentMethod | null {
  const text = normalize(String(value ?? ''));
  if (!text) return 'cash';
  if (text === 'credit_card' || text === 'credit card' || text === 'credit' || text === 'cc') return 'credit_card';
  if (text === 'bank_transfer' || text === 'bank transfer' || text === 'transfer' || text === 'tf' || text === 'qris') return 'bank_transfer';
  if (text === 'cash' || text === 'tunai') return 'cash';
  return null;
}

export function detectPaymentMethod(input: string): PaymentMethodDetection {
  const text = normalize(input);
  const credit = CREDIT_CARD_WORDS.some((word) => word.includes(' ') ? hasPhrase(text, word) : hasWord(text, word));
  const bank = BANK_TRANSFER_WORDS.some((word) => hasWord(text, word));
  const cash = CASH_WORDS.some((word) => hasWord(text, word));
  const matches = [credit, bank, cash].filter(Boolean).length;
  if (matches > 1) {
    return { method: null, explicit: true, error: 'Payment method is ambiguous.' };
  }
  if (credit) return { method: 'credit_card', explicit: true };
  if (bank) return { method: 'bank_transfer', explicit: true };
  if (cash) return { method: 'cash', explicit: true };
  return { method: 'cash', explicit: false };
}

function matchingAccounts(accounts: RoutableAccount[], text: string) {
  return accounts
    .filter((account) => containsAccountName(text, account.name))
    .sort((a, b) => b.name.length - a.name.length);
}

function resolveCreditCardAccount(accounts: RoutableAccount[], accountName: string) {
  const wanted = normalize(accountName);
  const exactCredit = accounts.filter((account) => account.type === 'credit_card' && normalize(account.name) === wanted);
  if (exactCredit.length > 1) return { error: `Ambiguous credit-card account: ${accountName}` };
  if (exactCredit.length === 1) return { account: exactCredit[0] };

  const matchingCredit = accounts.filter(
    (account) => account.type === 'credit_card' && accountNameWithoutCardPrefix(account.name) === wanted,
  );
  if (matchingCredit.length > 1) return { error: `Ambiguous credit-card account: ${accountName}` };
  if (matchingCredit.length === 1) return { account: matchingCredit[0] };
  return { error: `Credit-card account not found: ${accountName}` };
}

export function resolvePaymentAccount(
  accounts: RoutableAccount[],
  paymentMethodInput: unknown,
  accountNameInput?: unknown,
): AccountRoutingResult {
  const method = normalizePaymentMethod(paymentMethodInput);
  if (!method) return { method: 'cash', account: null, error: 'Unsupported payment method.' };

  const accountName = normalize(String(accountNameInput ?? ''));
  if (method === 'cash') {
    const cashAccounts = accounts.filter((account) => normalize(account.name) === 'cash');
    if (cashAccounts.length > 1) return { method, account: null, error: 'Ambiguous Cash account.' };
    if (cashAccounts.length === 0) return { method, account: null, error: 'Cash account not found.' };
    if (accountName && accountName !== 'cash') {
      return { method, account: null, error: `Payment method cash cannot use account: ${accountNameInput}` };
    }
    return { method, account: cashAccounts[0] };
  }

  if (!accountName) {
    return { method, account: null, error: 'A named account is required for this payment method.' };
  }

  if (method === 'credit_card') {
    const resolved = resolveCreditCardAccount(accounts, accountName);
    return { method, account: resolved.account ?? null, error: resolved.error };
  }

  const exact = accounts.filter((account) => normalize(account.name) === accountName);
  if (exact.length > 1) return { method, account: null, error: `Ambiguous bank account: ${accountNameInput}` };
  if (exact.length === 0) return { method, account: null, error: `Bank account not found: ${accountNameInput}` };
  if (exact[0].type === 'credit_card') {
    return { method, account: null, error: `Bank-transfer account has wrong type: ${exact[0].name}` };
  }
  return { method, account: exact[0] };
}

export function resolveAccountFromInput(input: string, accounts: RoutableAccount[]): AccountRoutingResult {
  const detection = detectPaymentMethod(input);
  if (!detection.method) return { method: 'cash', account: null, error: detection.error };
  const text = normalize(input);
  const matches = matchingAccounts(accounts, text);

  // No payment keyword was written, so a named non-cash account is the strongest signal.
  // "45rb bca makan" should route to BCA as a bank transfer; the cash default would lose it.
  if (!detection.explicit && detection.method === 'cash') {
    const named = matches.find((account) => normalize(account.name) !== 'cash');
    if (named) {
      return { method: named.type === 'credit_card' ? 'credit_card' : 'bank_transfer', account: named };
    }
    return resolvePaymentAccount(accounts, 'cash');
  }

  if (detection.method === 'cash') {
    const namedNonCash = matches.find((account) => normalize(account.name) !== 'cash');
    if (namedNonCash) {
      return {
        method: detection.method,
        account: null,
        error: `Payment method ${detection.explicit ? 'cash' : 'omitted'} cannot use account: ${namedNonCash.name}`,
      };
    }
    return resolvePaymentAccount(accounts, detection.method);
  }

  if (detection.method === 'credit_card') {
    const creditMatches = matches.filter((account) => account.type === 'credit_card');
    if (creditMatches.length > 1) return { method: detection.method, account: null, error: 'Ambiguous credit-card account.' };
    if (creditMatches.length === 1) return { method: detection.method, account: creditMatches[0] };
    const namedBank = matches.find((account) => account.type !== 'credit_card');
    if (!namedBank) return { method: detection.method, account: null, error: 'Named bank is required for a credit-card payment.' };
    return resolvePaymentAccount(accounts, detection.method, namedBank.name);
  }

  const bankMatches = matches.filter((account) => account.type !== 'credit_card');
  if (bankMatches.length > 1) return { method: detection.method, account: null, error: 'Ambiguous bank account.' };
  if (bankMatches.length === 1) return { method: detection.method, account: bankMatches[0] };
  const creditMatch = matches.find((account) => account.type === 'credit_card');
  if (creditMatch) return { method: detection.method, account: null, error: `Bank-transfer account has wrong type: ${creditMatch.name}` };
  return { method: detection.method, account: null, error: 'Named bank account is required for a transfer payment.' };
}
