-- Add unique constraint for monthly facts table to fix ON CONFLICT
-- This is the critical constraint that was missing

-- First drop existing index if it exists with wrong name
DROP INDEX IF EXISTS ux_fml_month_loc;

-- Create the proper unique index for the ON CONFLICT to work
CREATE UNIQUE INDEX IF NOT EXISTS ux_facts_monthly_location_month_location
ON public.facts_monthly_location (month, location_id);

-- Update the RPC function to work with the existing 'name' column structure
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
  v_loc_id uuid;
  v_new_locs int := 0;
  v_zero int := 0;
  v_upload_id uuid;
BEGIN
  -- Basic safety
  IF n = 0 THEN
    RAISE EXCEPTION 'No locations provided';
  END IF;
  IF array_length(p_volumes,1) IS DISTINCT FROM n
     OR array_length(p_mh_nets,1) IS DISTINCT FROM n THEN
    RAISE EXCEPTION 'Array length mismatch';
  END IF;

  -- Create upload record first
  INSERT INTO public.uploads(month, original_filename, row_count)
  VALUES (p_month, p_filename, n)
  RETURNING id INTO v_upload_id;

  FOR i IN 1..n LOOP
    -- 1) Find or create location (case-insensitive on name)
    SELECT id INTO v_loc_id
    FROM public.locations
    WHERE lower(name) = lower(p_locations[i])
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_loc_id IS NULL THEN
      -- Location doesn't exist, create it
      INSERT INTO public.locations(name)
      VALUES (p_locations[i])
      RETURNING id INTO v_loc_id;
      v_new_locs := v_new_locs + 1;
    ELSE
      -- Update existing location with latest casing
      UPDATE public.locations 
      SET name = p_locations[i] 
      WHERE id = v_loc_id;
    END IF;

    -- 2) Upsert monthly facts (now has unique constraint on month, location_id)
    INSERT INTO public.facts_monthly_location(upload_id, month, location_id, total_volume, mh_net_payout, updated_at)
    VALUES (v_upload_id, p_month, v_loc_id, coalesce(p_volumes[i],0), coalesce(p_mh_nets[i],0), now())
    ON CONFLICT (month, location_id) DO UPDATE
      SET total_volume = excluded.total_volume,
          mh_net_payout = excluded.mh_net_payout,
          upload_id = excluded.upload_id,
          updated_at = now();

    IF coalesce(p_volumes[i],0) = 0 THEN
      v_zero := v_zero + 1;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'inserted', n,
    'new_locations', v_new_locs,
    'zero_count', v_zero,
    'upload_id', v_upload_id
  );
END
$$;