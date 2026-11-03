'use client';

import { useEffect } from 'react';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function AuthSessionKeepAlive() {
  useEffect(() => {
    let stopped = false;

    async function refreshSession() {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!stopped && response.status === 401) window.location.assign('/login');
      } catch {
        // A transient network failure should not log the user out.
      }
    }

    const interval = window.setInterval(() => {
      void refreshSession();
    }, REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshSession();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}
