import id from './id.json';
import en from './en.json';

export type Locale = 'id' | 'en';
export const DEFAULT_LANGUAGE: Locale = 'id';

const dictionaries: Record<Locale, Record<string, any>> = { id, en };

function getByPath(obj: any, path: string): any {
  if (!path) return undefined;
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

export function t(a1: string, a2?: string, a3?: string): string {
  let locale: Locale = DEFAULT_LANGUAGE;
  let key: string = a1;
  let fallback: string | undefined;
  if (a1 === 'id' || a1 === 'en') {
    locale = a1;
    key = a2 ?? a1;
    fallback = a3;
  } else if (a2 !== undefined) {
    key = a1;
    fallback = a3 ?? a2;
  }
  const dict = dictionaries[locale];
  if (!dict) return key;
  const value = getByPath(dict, key);
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value[locale] === 'string') return value[locale];
  return fallback ?? key;
}

export function tf(a1: string, fallback: string): string {
  const raw = t(a1, fallback);
  return raw || fallback;
}