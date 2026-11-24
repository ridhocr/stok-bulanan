CREATE SCHEMA stock_auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stokbulanan_auth') THEN
    CREATE ROLE stokbulanan_auth NOLOGIN;
  END IF;
  EXECUTE format('GRANT stokbulanan_auth TO %I', current_user);
END $$;

CREATE TABLE stock_auth.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(trim(email))),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_auth.magic_links (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX magic_link_expiry ON stock_auth.magic_links (expires_at);

CREATE TABLE stock_auth.sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES stock_auth.accounts ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX session_expiry ON stock_auth.sessions (expires_at);

CREATE TABLE stock_auth.login_limits (
  scope_key text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0)
);
CREATE INDEX login_limit_expiry ON stock_auth.login_limits (expires_at);

REVOKE ALL ON SCHEMA stock_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA stock_auth TO stokbulanan_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA stock_auth TO stokbulanan_auth;

ALTER TABLE stock.shopping_lists ADD COLUMN budget_idr bigint CHECK (budget_idr >= 0);
