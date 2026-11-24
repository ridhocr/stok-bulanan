CREATE SCHEMA IF NOT EXISTS stock;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stokbulanan_app') THEN
    CREATE ROLE stokbulanan_app NOLOGIN;
  END IF;
  EXECUTE format('GRANT stokbulanan_app TO %I', current_user);
END $$;

CREATE FUNCTION stock.owner_id() RETURNS uuid LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('stokbulanan.owner_id', true), '')::uuid $$;

CREATE TYPE stock.cycle_status AS ENUM ('draft', 'active', 'closed');
CREATE TYPE stock.review_status AS ENUM ('kurang', 'pas', 'cukup', 'berlebih');
CREATE TYPE stock.list_status AS ENUM ('draft', 'shopping', 'finalized');

CREATE TABLE stock.profiles (
  user_id uuid PRIMARY KEY,
  household_name text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  default_cycle_days integer NOT NULL DEFAULT 30 CHECK (default_cycle_days BETWEEN 1 AND 366),
  safety_days integer NOT NULL DEFAULT 0 CHECK (safety_days BETWEEN 0 AND 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT stock.owner_id() REFERENCES stock.profiles ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE UNIQUE INDEX category_name ON stock.categories (user_id, lower(name));

CREATE TABLE stock.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT stock.owner_id() REFERENCES stock.profiles ON DELETE CASCADE,
  category_id uuid,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  base_unit text NOT NULL CHECK (base_unit IN ('pcs', 'g', 'ml')),
  pack_label text NOT NULL CHECK (length(trim(pack_label)) BETWEEN 1 AND 30),
  pack_size_base numeric(12,3) NOT NULL CHECK (pack_size_base > 0),
  purchase_increment_packs numeric(12,3) NOT NULL DEFAULT 1 CHECK (purchase_increment_packs > 0),
  initial_packs numeric(12,3) CHECK (initial_packs > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, category_id) REFERENCES stock.categories (user_id, id),
  CHECK (base_unit <> 'pcs' OR (pack_size_base = trunc(pack_size_base) AND purchase_increment_packs = trunc(purchase_increment_packs)))
);

CREATE TABLE stock.cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT stock.owner_id() REFERENCES stock.profiles ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date AND end_date - start_date < 366),
  status stock.cycle_status NOT NULL DEFAULT 'draft',
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX cycle_start ON stock.cycles (user_id, start_date DESC);
CREATE UNIQUE INDEX active_cycle ON stock.cycles (user_id) WHERE status = 'active';

CREATE TABLE stock.cycle_opening_stock (
  user_id uuid NOT NULL DEFAULT stock.owner_id(),
  cycle_id uuid NOT NULL,
  product_id uuid NOT NULL,
  qty_base numeric(12,3) NOT NULL CHECK (qty_base >= 0),
  source text NOT NULL CHECK (source IN ('carried', 'manual')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cycle_id, product_id),
  FOREIGN KEY (user_id, cycle_id) REFERENCES stock.cycles (user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, product_id) REFERENCES stock.products (user_id, id) ON DELETE CASCADE
);

CREATE TABLE stock.cycle_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT stock.owner_id(),
  cycle_id uuid NOT NULL,
  product_id uuid NOT NULL,
  status stock.review_status NOT NULL,
  remaining_qty_base numeric(12,3) NOT NULL,
  stockout_date date,
  note text,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, product_id),
  FOREIGN KEY (user_id, cycle_id) REFERENCES stock.cycles (user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, product_id) REFERENCES stock.products (user_id, id) ON DELETE CASCADE,
  CHECK ((status IN ('pas', 'kurang') AND remaining_qty_base = 0) OR
         (status IN ('cukup', 'berlebih') AND remaining_qty_base > 0)),
  CHECK (status = 'kurang' OR stockout_date IS NULL)
);
CREATE INDEX reviews_product ON stock.cycle_reviews (user_id, product_id);

CREATE TABLE stock.shopping_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT stock.owner_id(),
  cycle_id uuid NOT NULL UNIQUE,
  status stock.list_status NOT NULL DEFAULT 'draft',
  generated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, cycle_id) REFERENCES stock.cycles (user_id, id) ON DELETE CASCADE
);

CREATE TABLE stock.shopping_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT stock.owner_id(),
  shopping_list_id uuid NOT NULL,
  product_id uuid NOT NULL,
  suggested_qty_packs numeric(12,3) CHECK (suggested_qty_packs >= 0),
  planned_qty_packs numeric(12,3) CHECK (planned_qty_packs >= 0),
  actual_qty_packs numeric(12,3) CHECK (actual_qty_packs > 0),
  is_checked boolean NOT NULL DEFAULT false,
  confidence text NOT NULL CHECK (confidence IN ('tinggi', 'sedang', 'rendah')),
  reason_text text NOT NULL,
  recommendation jsonb NOT NULL,
  pack_size_base_snapshot numeric(12,3) NOT NULL CHECK (pack_size_base_snapshot > 0),
  pack_label_snapshot text NOT NULL,
  increment_packs_snapshot numeric(12,3) NOT NULL CHECK (increment_packs_snapshot > 0),
  last_price_per_pack_idr bigint CHECK (last_price_per_pack_idr >= 0),
  price_total_idr bigint CHECK (price_total_idr >= 0),
  UNIQUE (shopping_list_id, product_id),
  FOREIGN KEY (user_id, shopping_list_id) REFERENCES stock.shopping_lists (user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, product_id) REFERENCES stock.products (user_id, id) ON DELETE CASCADE,
  CHECK (mod(planned_qty_packs, increment_packs_snapshot) = 0),
  CHECK (mod(actual_qty_packs, increment_packs_snapshot) = 0),
  CHECK (NOT is_checked OR coalesce(actual_qty_packs, planned_qty_packs, 0) > 0)
);

CREATE TABLE stock.purchase_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT stock.owner_id(),
  cycle_id uuid NOT NULL,
  purchased_on date NOT NULL,
  source text NOT NULL CHECK (source IN ('manual', 'shopping_list')),
  shopping_list_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, cycle_id) REFERENCES stock.cycles (user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, shopping_list_id) REFERENCES stock.shopping_lists (user_id, id) ON DELETE CASCADE,
  CHECK ((source = 'shopping_list') = (shopping_list_id IS NOT NULL))
);
CREATE INDEX batches_cycle ON stock.purchase_batches (user_id, cycle_id, purchased_on);

CREATE TABLE stock.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT stock.owner_id(),
  batch_id uuid NOT NULL,
  product_id uuid NOT NULL,
  qty_packs numeric(12,3) NOT NULL CHECK (qty_packs > 0),
  pack_size_base_snapshot numeric(12,3) NOT NULL CHECK (pack_size_base_snapshot > 0),
  pack_label_snapshot text NOT NULL,
  increment_packs_snapshot numeric(12,3) NOT NULL CHECK (increment_packs_snapshot > 0),
  qty_base numeric(12,3) GENERATED ALWAYS AS (round(qty_packs * pack_size_base_snapshot, 3)) STORED CHECK (qty_base > 0),
  price_total_idr bigint CHECK (price_total_idr >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, product_id),
  FOREIGN KEY (user_id, batch_id) REFERENCES stock.purchase_batches (user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, product_id) REFERENCES stock.products (user_id, id) ON DELETE CASCADE,
  CHECK (mod(qty_packs, increment_packs_snapshot) = 0)
);
CREATE INDEX purchases_product ON stock.purchase_items (user_id, product_id, batch_id);

CREATE TABLE stock.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT stock.owner_id(),
  cycle_id uuid NOT NULL,
  name text NOT NULL CHECK (name = 'cycle_review_completed'),
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, name),
  FOREIGN KEY (user_id, cycle_id) REFERENCES stock.cycles (user_id, id) ON DELETE CASCADE
);

REVOKE ALL ON SCHEMA stock FROM PUBLIC;
GRANT USAGE ON SCHEMA stock TO stokbulanan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA stock TO stokbulanan_app;

DO $$
DECLARE entry record;
BEGIN
  FOR entry IN SELECT tablename FROM pg_tables WHERE schemaname = 'stock'
  LOOP
    EXECUTE format('ALTER TABLE stock.%I ENABLE ROW LEVEL SECURITY', entry.tablename);
    EXECUTE format('ALTER TABLE stock.%I FORCE ROW LEVEL SECURITY', entry.tablename);
    EXECUTE format(
      'CREATE POLICY account_scope ON stock.%I TO stokbulanan_app USING (user_id = (SELECT stock.owner_id())) WITH CHECK (user_id = (SELECT stock.owner_id()))',
      entry.tablename
    );
  END LOOP;
END $$;
