-- Add normalized column without unique constraint yet
ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS name_norm text GENERATED ALWAYS AS (lower(name)) STORED;

-- For now, add unique constraint on (month, location_id) for facts table only
-- This is the critical one that was causing the ON CONFLICT error
DROP INDEX IF EXISTS ux_fml_month_loc;
CREATE UNIQUE INDEX ux_fml_month_loc
ON public.facts_monthly_location (month, location_id);

-- Update the RPC function to handle location duplicates gracefully
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
BEGIN
  -- Basic safety
  IF n = 0 THEN
    RAISE EXCEPTION 'No locations provided';
  END IF;
  IF array_length(p_volumes,1) IS DISTINCT FROM n
     OR array_length(p_mh_nets,1) IS DISTINCT FROM n THEN
    RAISE EXCEPTION 'Array length mismatch';
  END IF;

  FOR i IN 1..n LOOP
    -- 1) Find or create location (handle duplicates gracefully)
    -- First try to find existing location (case-insensitive)
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

    -- 2) Upsert monthly facts (this now has unique constraint)
    INSERT INTO public.facts_monthly_location(month, location_id, total_volume, mh_net_payout, updated_at)
    VALUES (p_month, v_loc_id, coalesce(p_volumes[i],0), coalesce(p_mh_nets[i],0), now())
    ON CONFLICT (month, location_id) DO UPDATE
      SET total_volume = excluded.total_volume,
          mh_net_payout = excluded.mh_net_payout,
          updated_at = now();

    IF coalesce(p_volumes[i],0) = 0 THEN
      v_zero := v_zero + 1;
    END IF;
  END LOOP;

  -- 3) Log the upload
  INSERT INTO public.uploads(month, original_filename, row_count)
  VALUES (p_month, p_filename, n);

  RETURN json_build_object(
    'inserted', n,
    'new_locations', v_new_locs,
    'zero_count', v_zero
  );
END
$$;