-- Create the bulk upload function with proper table names
create or replace function mh_upload_master(
  p_month date,
  p_filename text,
  p_locations text[],
  p_volumes numeric[],
  p_mh_nets numeric[]
) returns json language plpgsql security definer as $$
declare
  v_upload_id uuid;
  v_new_locs int := 0;
  v_zero int := 0;
begin
  if array_length(p_locations,1) is null then
    raise exception 'No rows provided';
  end if;

  -- Insert into upload_audits (not uploads)
  insert into upload_audits(month, original_filename, row_count)
  values (date_trunc('month', p_month)::date, coalesce(p_filename,'upload'), array_length(p_locations,1))
  returning id into v_upload_id;

  -- Upsert locations with case-insensitive unique constraint
  with incoming as (
    select trim(p_locations[i]) as name
    from generate_subscripts(p_locations,1) g(i)
    where trim(p_locations[i]) <> ''
  ),
  canon as (
    insert into locations(name)
    select distinct name from incoming
    on conflict (name) do nothing
    returning 1
  )
  select coalesce(sum(1),0) into v_new_locs from canon;

  -- Insert into facts (not facts_monthly_location) with upsert
  insert into facts(upload_id, month, location_id, total_volume, mh_net_payout, is_zero_volume)
  select
    v_upload_id,
    date_trunc('month', p_month)::date,
    l.id,
    p_volumes[i],
    p_mh_nets[i],
    p_volumes[i] = 0
  from generate_subscripts(p_locations,1) g(i)
  join locations l on lower(l.name) = lower(trim(p_locations[i]))
  where trim(p_locations[i]) <> ''
  on conflict (month, location_id) do update set
    total_volume = excluded.total_volume,
    mh_net_payout = excluded.mh_net_payout,
    is_zero_volume = excluded.is_zero_volume,
    upload_id = excluded.upload_id,
    updated_at = now();

  -- Count zero volume records
  select count(*) into v_zero
  from facts
  where upload_id = v_upload_id and total_volume = 0;

  return json_build_object(
    'upload_id', v_upload_id,
    'inserted', array_length(p_locations,1),
    'new_locations', v_new_locs,
    'zero_count', v_zero
  );
end $$;