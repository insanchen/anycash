import http from 'http';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8902';
const ROUTES = ['/api/health', '/dashboard/dashboard', '/dashboard/transactions', '/dashboard/reports', '/dashboard/accounts', '/dashboard/settings'];

function check(path: string): Promise<{ path: string; status: number | null }> {
  return new Promise((resolve) => {
    const u = new URL(path, 'http://localhost:8902');
    const req = http.get({ hostname: u.hostname, port: Number(u.port), path: u.pathname, timeout: 5000 }, (res) => {
      resolve({ path, status: res.statusCode ?? null });
    });
    req.on('error', () => resolve({ path, status: null }));
    req.on('timeout', () => { req.destroy(); resolve({ path, status: null }); });
  });
}

(async () => {
  const results = await Promise.all(ROUTES.map(check));
  const failures = results.filter((r) => r.status == null || r.status === 0);
  console.log(JSON.stringify({ results, failures: failures.map((r) => r.path) }, null, 2));
  if (failures.length) process.exit(1);
  process.exit(0);
})();
