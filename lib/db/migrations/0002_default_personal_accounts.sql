INSERT INTO accounts (user_id, name, type, currency, balance, created_at)
SELECT u.id, 'Akun Utama', 'personal', 'IDR', 0, now()
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.type = 'personal'
);
--> statement-breakpoint
INSERT INTO account_members (account_id, user_id, role, joined_at)
SELECT a.id, a.user_id, 'owner', now()
FROM accounts a
WHERE a.name = 'Akun Utama'
  AND a.type = 'personal'
  AND NOT EXISTS (
    SELECT 1 FROM account_members am
    WHERE am.account_id = a.id AND am.user_id = a.user_id
  );