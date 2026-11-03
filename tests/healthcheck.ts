import http from 'http';

function check(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.get({
      hostname: u.hostname,
      port: Number(u.port),
      path: '/api/health',
      timeout: 3000
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(res.statusCode as number));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

(async () => {
  const code = await check(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:8902');
  if (code !== 200) {
    console.error('healthcheck failed', code);
    process.exit(1);
  }
  console.log('healthcheck ok', code);
})();
