import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../components/auth/AuthSessionKeepAlive.tsx', import.meta.url), 'utf8');

assert.ok(source.includes("import { useRouter } from 'next/navigation';"));
assert.ok(source.includes('const router = useRouter();'));
assert.ok(source.includes("router.replace('/login')"));
assert.ok(!source.includes("window.location.assign('/login')"));
assert.ok(source.includes('  }, [router]);'));

console.log('Auth session keepalive navigation contract passed');
