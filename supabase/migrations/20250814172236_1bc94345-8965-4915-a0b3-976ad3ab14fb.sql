-- 0) Safety: required extensions (no-op if present)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) Ensure locations has a case-insensitive unique key
-- Note: Adapting to existing schema (using 'name' column instead of 'dba')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='locations' AND column_name='name_norm'
  ) THEN
    ALTER TABLE public.locations
      ADD COLUMN name_norm text GENERATED ALWAYS AS (lower(name)) STORED;
  END IF;
EXCEPTION WHEN others THEN NULL;
END$$;

DO $$
BEGIN
  ALTER TABLE public.locations ADD CONSTRAINT uq_locations_name_norm UNIQUE (name_norm);
EXCEPTION WHEN duplicate_table THEN NULL;
EXCEPTION WHEN unique_violation THEN NULL;
END$$;

-- 2) Update uploads table structure to match the new requirements
DO $$
BEGIN
  -- Add missing columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='uploads' AND column_name='rows_inserted'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN rows_inserted int DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='uploads' AND column_name='new_locations'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN new_locations int DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='uploads' AND column_name='zero_count'
  ) THEN
    ALTER TABLE public.uploads ADD COLUMN zero_count int DEFAULT 0;
  END IF;
END$$;

-- 3) Update facts_monthly_location table - add agent_net column (aliasing mh_net_payout)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='facts_monthly_location' AND column_name='agent_net'
  ) THEN
    -- Add agent_net column that mirrors mh_net_payout
    ALTER TABLE public.facts_monthly_location 
    ADD COLUMN agent_net numeric(18,2) GENERATED ALWAYS AS (mh_net_payout) STORED;
  END IF;
END$$;

-- Create unique index if not exists
CREATE UNIQUE INDEX IF NOT EXISTS ux_fml_month_loc
  ON public.facts_monthly_location (month, location_id);

-- 4) Make the FK DEFERRABLE (so a same-transaction insert of the location is ok)
DO $$
DECLARE
  v_name text := 'facts_monthly_location_location_id_fkey';
BEGIN
  IF EXISTS (SELECT 1
             FROM pg_constraint c
             JOIN pg_class t ON t.oid = c.conrelid
            WHERE t.relname = 'facts_monthly_location' AND c.conname = v_name) THEN
    ALTER TABLE public.facts_monthly_location
      ALTER CONSTRAINT facts_monthly_location_location_id_fkey
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END$$;

-- 5) Backfill any legacy rows with missing upload_id (so NOT NULL is satisfied)
DO $$
DECLARE v_up uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.facts_monthly_location WHERE upload_id IS NULL) THEN
    INSERT INTO public.uploads(month, original_filename) VALUES (CURRENT_DATE, 'legacy_backfill')
    RETURNING id INTO v_up;
    UPDATE public.facts_monthly_location SET upload_id = v_up WHERE upload_id IS NULL;
  END IF;
END$$;

-- 6) HARDENED RPC: both location upsert and facts upsert in one CTE chain per row
-- Adapted to work with existing schema (name instead of dba, mh_net_payout instead of agent_net)
CREATE OR REPLACE FUNCTION public.mh_upload_master(
  p_month date,
  p_filename text,
  p_locations text[],
  p_volumes numeric[],
  p_mh_nets numeric[]
) RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  n int := coalesce(array_length(p_locations,1), 0);
  i int;
  v_new_locs int := 0;
  v_zero int := 0;
  v_skipped int := 0;
  v_upload_id uuid;
  v_clean_name text;
  v_vol numeric;
  v_net numeric;
  v_before_count int;
BEGIN
  IF n = 0 THEN
    RAISE EXCEPTION 'No locations provided';
  END IF;
  IF array_length(p_volumes,1) IS DISTINCT FROM n
     OR array_length(p_mh_nets,1) IS DISTINCT FROM n THEN
    RAISE EXCEPTION 'Array length mismatch';
  END IF;

  INSERT INTO public.uploads(month, original_filename) VALUES (p_month, p_filename)
  RETURNING id INTO v_upload_id;

  FOR i IN 1..n LOOP
    -- Normalize/skip empty names
    v_clean_name := trim(regexp_replace(coalesce(p_locations[i], ''), '\s+', ' ', 'g'));
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_vol := coalesce(p_volumes[i], 0);
    v_net := coalesce(p_mh_nets[i], 0);

    -- remember count to detect new insert
    SELECT count(*) INTO v_before_count
    FROM public.locations WHERE name_norm = lower(v_clean_name);

    -- ONE CTE: ensure location exists and get its id; then upsert facts using that id.
    WITH loc AS (
      INSERT INTO public.locations (name)
      VALUES (v_clean_name)
      ON CONFLICT (name_norm) DO UPDATE SET name = excluded.name
      RETURNING id
    ), loc_id AS (
      -- if inserted, we have id; if not, pick existing
      SELECT id FROM loc
      UNION ALL
      SELECT id FROM public.locations WHERE name_norm = lower(v_clean_name) LIMIT 1
    )
    INSERT INTO public.facts_monthly_location (month, location_id, total_volume, mh_net_payout, upload_id, updated_at)
    SELECT p_month, (SELECT id FROM loc_id), v_vol, v_net, v_upload_id, now()
    ON CONFLICT (month, location_id) DO UPDATE
      SET total_volume = excluded.total_volume,
          mh_net_payout = excluded.mh_net_payout,
          upload_id = excluded.upload_id,
          updated_at = now();

    -- count new location if it didn't exist before
    IF v_before_count = 0 THEN
      v_new_locs := v_new_locs + 1;
    END IF;

    IF v_vol = 0 THEN
      v_zero := v_zero + 1;
    END IF;
  END LOOP;

  UPDATE public.uploads
     SET rows_inserted = n - v_skipped,
         new_locations = v_new_locs,
         zero_count = v_zero
   WHERE id = v_upload_id;

  RETURN json_build_object(
    'inserted', n - v_skipped,
    'new_locations', v_new_locs,
    'zero_count', v_zero,
    'skipped_empty_names', v_skipped,
    'upload_id', v_upload_id
  );
END
$$;

-- 7) (Optional while testing) disable RLS to avoid surprises
ALTER TABLE public.locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.facts_monthly_location DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads DISABLE ROW LEVEL SECURITY;