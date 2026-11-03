// AnyCash database schema (Drizzle ORM).
// `sql.numeric(...)`, `text(..., { array: true })`, and raw `sql` checks are avoided for
// compatibility with the installed drizzle-orm.

import { pgTable, uuid, varchar, text, integer, bigint, boolean, timestamp, index, uniqueIndex, primaryKey, numeric } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull(),
  username: varchar('username', { length: 100 }),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 10 }).notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  emailIdx: uniqueIndex('idx_users_email').on(t.email),
}));

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  rateSource: varchar('rate_source', { length: 60 }).notNull().default('manual'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  keyPrefix: varchar('key_prefix', { length: 32 }).notNull(),
  keyHash: varchar('key_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 120 }).notNull().default(''),
  scopes: text('scopes').array().notNull().default([]),
  rateLimit: integer('rate_limit').notNull().default(100),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  keyHashIdx: uniqueIndex('idx_api_keys_key_hash').on(t.keyHash),
  userIdIdx: index('idx_api_keys_user_id').on(t.userId),
}));

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('personal'),
  currency: varchar('currency', { length: 3 }).notNull().default('IDR'),
  balance: bigint('balance', { mode: 'number' }).notNull().default(0),
  accountNumber: varchar('account_number', { length: 64 }),
  creditLimit: bigint('credit_limit', { mode: 'number' }),
  statementDate: integer('statement_date'),
  dueDate: integer('due_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_accounts_user_id').on(t.userId),
  currencyIdx: index('idx_accounts_currency').on(t.currency),
  typeIdx: index('idx_accounts_type').on(t.type),
}));

export const userAccountOrder = pgTable(
  'user_account_order',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.accountId] }),
    userPositionIdx: index('idx_user_account_order_user_position').on(t.userId, t.position),
  })
);

export const accountMembers = pgTable(
  'account_members',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 10 }).notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.accountId, t.userId] }),
  })
);

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  parentId: uuid('parent_id').references((): any => categories.id, { onDelete: 'restrict' }),
  isDefault: boolean('is_default').notNull().default(false),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  typeIdx: index('idx_categories_type').on(t.type),
  parentIdIdx: index('idx_categories_parent_id').on(t.parentId),
}));

export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  amountSource: bigint('amount_source', { mode: 'number' }),
  amountDestination: bigint('amount_destination', { mode: 'number' }),
  type: varchar('type', { length: 20 }).notNull(),
  note: text('note'),
  date: timestamp('date', { withTimezone: true }).defaultNow().notNull(),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'restrict' }),
  subcategoryId: uuid('subcategory_id').references(() => categories.id, { onDelete: 'restrict' }),
  payee: varchar('payee', { length: 200 }),
  tags: text('tags').array().notNull().default([]),
  transferPairId: uuid('transfer_pair_id'),
  exchangeRate: numeric('exchange_rate', { precision: 18, scale: 8 }),
  exchangeCurrency: varchar('exchange_currency', { length: 3 }),
  rateSource: varchar('rate_source', { length: 60 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  accountIdDateIdx: index('idx_transactions_account_id_date').on(t.accountId, t.date),
  categoryIdIdx: index('idx_transactions_category_id').on(t.categoryId),
  subcategoryIdIdx: index('idx_transactions_subcategory_id').on(t.subcategoryId),
  payeeIdx: index('idx_transactions_payee').on(t.payee),
  typeIdx: index('idx_transactions_type').on(t.type),
  transferPairIdIdx: index('idx_transactions_transfer_pair_id').on(t.transferPairId),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tokenHashIdx: uniqueIndex('idx_refresh_tokens_token_hash').on(t.tokenHash),
  userIdIdx: index('idx_refresh_tokens_user_id').on(t.userId),
}));

export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  details: text('details').notNull().default('{}'),
  ipAddress: varchar('ip_address', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_audit_log_user_id').on(t.userId),
  createdAtIdx: index('idx_audit_log_created_at').on(t.createdAt),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserSetting = typeof userSettings.$inferSelect;
export type NewUserSetting = typeof userSettings.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type AccountMember = typeof accountMembers.$inferSelect;
export type NewAccountMember = typeof accountMembers.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
