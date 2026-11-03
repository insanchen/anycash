export const ACCESS_COOKIE = 'anycash_access';
export const REFRESH_COOKIE = 'anycash_refresh';

export const accessCookieMaxAge = () => Number(process.env.ACCESS_TOKEN_TTL || 900);

export const refreshCookieMaxAge = () => Number(process.env.REFRESH_TOKEN_TTL || 2592000);

export const buildAuthCookieOptions = () => {
  const flag = process.env.COOKIE_SECURE;
  const secure = flag !== undefined ? flag === 'true' : process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure,
  };
};

export const accessCookieMeta = () => ({
  name: ACCESS_COOKIE,
  ...buildAuthCookieOptions(),
  maxAge: accessCookieMaxAge(),
});

export const refreshCookieMeta = () => ({
  name: REFRESH_COOKIE,
  ...buildAuthCookieOptions(),
  maxAge: refreshCookieMaxAge(),
});

export const authCookieClearMeta = () => [
  { ...accessCookieMeta(), value: '', maxAge: 0 },
  { ...refreshCookieMeta(), value: '', maxAge: 0 },
];
