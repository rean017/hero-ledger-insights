-- FINAL hardening of mh_upload_master: bullet-proof location_id resolution
-- Adapted to work with existing schema (name column, not dba)

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
  v_skipped int := 0;
  v_upload_id uuid;
  v_clean_name text;
  v_vol numeric;
  v_net numeric;
BEGIN
  IF n = 0 THEN
    RAISE EXCEPTION 'No locations provided';
  END IF;
  IF array_length(p_volumes,1) IS DISTINCT FROM n
     OR array_length(p_mh_nets,1) IS DISTINCT FROM n THEN
    RAISE EXCEPTION 'Array length mismatch';
  END IF;

  -- Ensure required unique constraint exists
  PERFORM 1
  FROM pg_indexes
  WHERE schemaname='public' AND indexname='ux_facts_monthly_location_month_location';
  IF NOT FOUND THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_facts_monthly_location_month_location
      ON public.facts_monthly_location (month, location_id);
  END IF;

  INSERT INTO public.uploads(month, original_filename, row_count)
  VALUES (p_month, p_filename, n)
  RETURNING id INTO v_upload_id;

  FOR i IN 1..n LOOP
    -- Clean + skip empty location name rows
    v_clean_name := regexp_replace(coalesce(p_locations[i], ''), '\s+', ' ', 'g');
    v_clean_name := trim(v_clean_name);
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_vol := coalesce(p_volumes[i], 0);
    v_net := coalesce(p_mh_nets[i], 0);

    -- 1) Try to find existing (fast path) - case insensitive lookup
    SELECT id INTO v_loc_id
    FROM public.locations
    WHERE lower(name) = lower(v_clean_name)
    LIMIT 1;

    -- 2) If not found, try to insert new location
    IF v_loc_id IS NULL THEN
      BEGIN
        INSERT INTO public.locations(name)
        VALUES (v_clean_name)
        RETURNING id INTO v_loc_id;
        v_new_locs := v_new_locs + 1;
      EXCEPTION WHEN unique_violation THEN
        -- Race condition: another process inserted it
        SELECT id INTO v_loc_id
        FROM public.locations
        WHERE lower(name) = lower(v_clean_name)
        LIMIT 1;
      END;
    ELSE
      -- Update existing location with latest casing
      UPDATE public.locations SET name = v_clean_name WHERE id = v_loc_id;
    END IF;

    -- 3) If STILL no id, raise an explicit error with the offending location name
    IF v_loc_id IS NULL THEN
      RAISE EXCEPTION 'Could not resolve location id for name: "%"', v_clean_name;
    END IF;

    -- 4) Upsert facts; always set upload_id (using correct column names)
    INSERT INTO public.facts_monthly_location(
      upload_id, month, location_id, total_volume, mh_net_payout, updated_at
    )
    VALUES (v_upload_id, p_month, v_loc_id, v_vol, v_net, now())
    ON CONFLICT (month, location_id) DO UPDATE
      SET total_volume = excluded.total_volume,
          mh_net_payout = excluded.mh_net_payout,
          upload_id = excluded.upload_id,
          updated_at = now();

    IF v_vol = 0 THEN
      v_zero := v_zero + 1;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'inserted', n - v_skipped,
    'new_locations', v_new_locs,
    'zero_count', v_zero,
    'skipped_empty_names', v_skipped,
    'upload_id', v_upload_id
  );
END
$$;