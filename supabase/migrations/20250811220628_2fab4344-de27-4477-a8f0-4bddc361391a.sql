-- Create the new bulk import RPC function for the stable schema
CREATE OR REPLACE FUNCTION mh_upload_master(
  p_month date,
  p_filename text,
  p_locations text[],
  p_volumes numeric[],
  p_mh_nets numeric[]
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
declare
  v_upload_id uuid;
  v_rows int;
  v_new_locs int;
  v_zero int;
begin
  v_rows := coalesce(array_length(p_locations,1), 0);
  if v_rows = 0 then
    raise exception 'No rows passed to mh_upload_master';
  end if;

  -- 1) create upload
  insert into uploads(month, original_filename, row_count)
  values (date_trunc('month', p_month)::date, coalesce(p_filename,'upload'), v_rows)
  returning id into v_upload_id;

  -- 2) upsert locations (case-insensitive)
  with incoming as (
    select trim(p_locations[i]) as name
    from generate_subscripts(p_locations,1) g(i)
    where trim(p_locations[i]) <> ''
  ), ins as (
    insert into locations_new(name)
    select distinct name from incoming
    on conflict (lower(name)) do nothing
    returning id
  )
  select count(*) into v_new_locs from ins;

  -- 3) insert facts in bulk
  insert into facts_monthly_location(upload_id, month, location_id, total_volume, mh_net_payout)
  select
    v_upload_id,
    date_trunc('month', p_month)::date,
    l.id,
    p_volumes[i],
    p_mh_nets[i]
  from generate_subscripts(p_locations,1) g(i)
  join locations_new l on lower(l.name) = lower(trim(p_locations[i]));

  -- 4) zero-volume count (computed)
  select count(*) into v_zero
  from facts_monthly_location
  where upload_id = v_upload_id
    and is_zero_volume;

  return json_build_object(
    'upload_id', v_upload_id,
    'inserted', v_rows,
    'new_locations', coalesce(v_new_locs,0),
    'zero_count', v_zero
  );
end $$;