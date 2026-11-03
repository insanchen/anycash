-- AnyCash API key format migration
-- Canonical format: ac_<16 lowercase hex>.<64 lowercase hex>

ALTER TABLE api_keys
  ALTER COLUMN key_prefix TYPE VARCHAR(32);