-- === CORE TABLES FOR MERCHANT HERO ===
-- Drop existing policies that may conflict
DROP POLICY IF EXISTS "Allow all operations on agents" ON agents;

-- Only create tables if they don't exist, skip policies for existing tables
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

-- Enable RLS on new tables only
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'locations_new' AND rowsecurity = true) THEN
        ALTER TABLE locations_new ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'uploads' AND rowsecurity = true) THEN
        ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'facts_monthly_location' AND rowsecurity = true) THEN
        ALTER TABLE facts_monthly_location ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Create policies only if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'locations_new' AND policyname = 'Allow all operations on locations_new') THEN
        CREATE POLICY "Allow all operations on locations_new" ON locations_new FOR ALL USING (true) WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'uploads' AND policyname = 'Allow all operations on uploads') THEN
        CREATE POLICY "Allow all operations on uploads" ON uploads FOR ALL USING (true) WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facts_monthly_location' AND policyname = 'Allow all operations on facts_monthly_location') THEN
        CREATE POLICY "Allow all operations on facts_monthly_location" ON facts_monthly_location FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;