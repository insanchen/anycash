CREATE TABLE IF NOT EXISTS "user_account_order" (
  "user_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_account_order_pkey" PRIMARY KEY("user_id", "account_id")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_account_order_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "user_account_order"
      ADD CONSTRAINT "user_account_order_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_account_order_account_id_accounts_id_fk'
  ) THEN
    ALTER TABLE "user_account_order"
      ADD CONSTRAINT "user_account_order_account_id_accounts_id_fk"
      FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_account_order_user_position" ON "user_account_order" USING btree ("user_id", "position");
