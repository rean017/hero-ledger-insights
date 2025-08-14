-- First, clean up duplicate locations by keeping the first one of each lower(name)
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at) as rn
  FROM locations
)
DELETE FROM locations 
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Now create the unique index for case-insensitive location names
CREATE UNIQUE INDEX IF NOT EXISTS locations_name_lower_unique ON locations (lower(name));

-- Create uploads table if not exists
CREATE TABLE IF NOT EXISTS uploads (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  original_filename text not null,
  row_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Create facts_monthly_location table if not exists
CREATE TABLE IF NOT EXISTS facts_monthly_location (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references uploads(id) on delete cascade,
  month date not null,
  location_id uuid not null references locations(id),
  total_volume numeric(14,2) not null,
  mh_net_payout numeric(14,2) not null,
  is_zero_volume boolean generated always as (total_volume = 0) stored
);

CREATE INDEX IF NOT EXISTS idx_fml_month_loc ON facts_monthly_location(month, location_id);

-- Remove any leftover demo/ghost tables
DROP TABLE IF EXISTS upload_audits CASCADE;

-- Update the RPC function for bulk import
CREATE OR REPLACE FUNCTION mh_upload_master(
  p_month date,
  p_filename text,
  p_locations text[],
  p_volumes numeric[],
  p_mh_nets numeric[]
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_upload_id uuid;
  v_rows int;
  v_new_locs int;
  v_zero int;
BEGIN
  v_rows := coalesce(array_length(p_locations,1), 0);
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'No rows passed to mh_upload_master';
  END IF;

  -- 1) create upload audit row
  INSERT INTO uploads(month, original_filename, row_count)
  VALUES (date_trunc('month', p_month)::date, coalesce(p_filename,'upload'), v_rows)
  RETURNING id INTO v_upload_id;

  -- 2) upsert locations by case-insensitive name
  WITH incoming AS (
    SELECT trim(p_locations[i]) as name
    FROM generate_subscripts(p_locations,1) g(i)
    WHERE trim(p_locations[i]) <> ''
  ), ins AS (
    INSERT INTO locations(name)
    SELECT DISTINCT name FROM incoming
    ON CONFLICT (lower(name)) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_new_locs FROM ins;

  -- 3) insert facts in bulk
  INSERT INTO facts_monthly_location(upload_id, month, location_id, total_volume, mh_net_payout)
  SELECT
    v_upload_id,
    date_trunc('month', p_month)::date,
    l.id,
    p_volumes[i],
    p_mh_nets[i]
  FROM generate_subscripts(p_locations,1) g(i)
  JOIN locations l ON lower(l.name) = lower(trim(p_locations[i]));

  -- 4) computed zero-volume count
  SELECT count(*) INTO v_zero
  FROM facts_monthly_location
  WHERE upload_id = v_upload_id
    AND is_zero_volume;

  RETURN json_build_object(
    'upload_id', v_upload_id,
    'inserted', v_rows,
    'new_locations', coalesce(v_new_locs,0),
    'zero_count', v_zero
  );
END $$;