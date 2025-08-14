-- First, add the normalized column without unique constraint
ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS name_norm text GENERATED ALWAYS AS (lower(name)) STORED;

-- Remove duplicate locations (keep the most recent one for each name)
WITH duplicates AS (
  SELECT id, name, 
         ROW_NUMBER() OVER (PARTITION BY lower(name) ORDER BY created_at DESC) as rn
  FROM public.locations
)
DELETE FROM public.locations 
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Now add the unique constraint
ALTER TABLE public.locations
ADD CONSTRAINT uq_locations_name_norm UNIQUE (name_norm);

-- Add unique constraint for monthly facts (month + location_id)
CREATE UNIQUE INDEX IF NOT EXISTS ux_fml_month_loc
ON public.facts_monthly_location (month, location_id);

-- Update the RPC function to work with existing schema
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
    -- 1) Upsert location (case-insensitive on name)
    WITH ins AS (
      INSERT INTO public.locations(name)
      VALUES (p_locations[i])
      ON CONFLICT (name_norm) DO NOTHING
      RETURNING id
    )
    SELECT id INTO v_loc_id FROM ins;

    IF v_loc_id IS NULL THEN
      -- existed already; get its id
      SELECT id INTO v_loc_id
      FROM public.locations
      WHERE name_norm = lower(p_locations[i]);
      -- keep the latest casing for display
      UPDATE public.locations SET name = p_locations[i] WHERE id = v_loc_id;
    ELSE
      v_new_locs := v_new_locs + 1;
    END IF;

    -- 2) Upsert monthly facts
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