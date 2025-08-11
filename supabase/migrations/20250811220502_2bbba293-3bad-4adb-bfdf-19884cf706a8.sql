-- === CORE TABLES FOR MERCHANT HERO ===

-- Agents (optional; keep for future)
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Canonical Locations (unique by lower(name))
CREATE TABLE IF NOT EXISTS locations_new (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create unique index for case-insensitive name uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS locations_new_name_lower_unique ON locations_new (lower(name));

-- Uploads (audit for each import)
CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,                        -- first of month (YYYY-MM-01)
  original_filename text NOT NULL,
  row_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Facts: monthly numbers per location per upload
CREATE TABLE IF NOT EXISTS facts_monthly_location (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  month date NOT NULL,                        -- first of month
  location_id uuid NOT NULL REFERENCES locations_new(id),
  total_volume numeric(14,2) NOT NULL,
  mh_net_payout numeric(14,2) NOT NULL,
  -- computed automatically; NEVER set in inserts
  is_zero_volume boolean GENERATED ALWAYS AS (total_volume = 0) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fml_month_loc ON facts_monthly_location(month, location_id);
CREATE INDEX IF NOT EXISTS idx_fml_upload ON facts_monthly_location(upload_id);

-- Migrate existing data from old tables to new tables
INSERT INTO locations_new (name, created_at)
SELECT DISTINCT name, created_at
FROM locations 
ON CONFLICT (lower(name)) DO NOTHING;

-- RLS policies for new tables
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE facts_monthly_location ENABLE ROW LEVEL SECURITY;

-- Allow all operations (can be restricted later)
CREATE POLICY "Allow all operations on agents" ON agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on locations_new" ON locations_new FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on uploads" ON uploads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on facts_monthly_location" ON facts_monthly_location FOR ALL USING (true) WITH CHECK (true);