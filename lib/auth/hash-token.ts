import crypto from 'node:crypto';

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export const randomPrefix = (bytes = 6): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
