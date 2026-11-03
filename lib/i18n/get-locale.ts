import { cookies } from 'next/headers';
import { DEFAULT_LANGUAGE, type Locale } from './index';

const ACCEPTED: Locale[] = ['id', 'en'];

export async function getLocale(): Promise<Locale> {
  const raw = (await cookies()).get('locale')?.value;
  return parseLocale(raw);
}

export function parseLocale(input: string | undefined | null): Locale {
  if (!input) return DEFAULT_LANGUAGE;
  const lower = input.toLowerCase();
  if (lower.startsWith('id')) return 'id';
  if (lower.startsWith('en')) return 'en';
  return DEFAULT_LANGUAGE;
}

export function negotiateLocale(acceptLanguage: string | undefined | null): Locale {
  if (!acceptLanguage) return DEFAULT_LANGUAGE;
  const parts = acceptLanguage.split(',').map((part) => part.trim().split(';')[0]?.toLowerCase());
  for (const part of parts) {
    if (!part) continue;
    const matched = ACCEPTED.find((locale) => part === locale || part.startsWith(`${locale}-`));
    if (matched) return matched;
  }
  return DEFAULT_LANGUAGE;
}
