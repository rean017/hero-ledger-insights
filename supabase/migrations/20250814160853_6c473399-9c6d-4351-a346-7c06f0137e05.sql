-- Fix remaining function search_path security issue
CREATE OR REPLACE FUNCTION public.mh_upload_master(
  p_month date,
  p_filename text,
  p_locations text[],
  p_volumes numeric[],
  p_mh_nets numeric[]
) RETURNS json 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  INSERT INTO uploads(month, original_filename, row_count)
  VALUES (date_trunc('month', p_month)::date, coalesce(p_filename, 'upload'), v_rows)
  RETURNING id INTO v_upload_id;

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

  INSERT INTO facts_monthly_location(upload_id, month, location_id, total_volume, mh_net_payout)
  SELECT
    v_upload_id,
    date_trunc('month', p_month)::date,
    l.id,
    p_volumes[i],
    p_mh_nets[i]
  FROM generate_subscripts(p_locations,1) g(i)
  JOIN locations l ON lower(l.name) = lower(trim(p_locations[i]));

  SELECT count(*) INTO v_zero
  FROM facts_monthly_location
  WHERE upload_id = v_upload_id AND is_zero_volume;

  RETURN json_build_object(
    'upload_id', v_upload_id,
    'inserted', v_rows,
    'new_locations', coalesce(v_new_locs,0),
    'zero_count', v_zero
  );
END $$;