-- ===== CORE TABLES =====

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint locations_name_lower_unique unique (lower(name))
);

create table if not exists uploads (
  id uuid primary key default gen_random_uuid(),
  month date not null,                  -- first day of month
  original_filename text not null,
  row_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists facts_monthly_location (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references uploads(id) on delete cascade,
  month date not null,
  location_id uuid not null references locations(id),
  total_volume numeric(14,2) not null,
  mh_net_payout numeric(14,2) not null,
  is_zero_volume boolean generated always as (total_volume = 0) stored
);

create index if not exists idx_fml_month_loc on facts_monthly_location(month, location_id);

-- remove any ghost/demo tables that cause errors
drop table if exists upload_audits cascade;

-- ===== RPC FUNCTION =====

create or replace function mh_upload_master(
  p_month date,
  p_filename text,
  p_locations text[],
  p_volumes numeric[],
  p_mh_nets numeric[]
) returns json language plpgsql as $$
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

  insert into uploads(month, original_filename, row_count)
  values (date_trunc('month', p_month)::date, coalesce(p_filename, 'upload'), v_rows)
  returning id into v_upload_id;

  with incoming as (
    select trim(p_locations[i]) as name
    from generate_subscripts(p_locations,1) g(i)
    where trim(p_locations[i]) <> ''
  ), ins as (
    insert into locations(name)
    select distinct name from incoming
    on conflict (lower(name)) do nothing
    returning id
  )
  select count(*) into v_new_locs from ins;

  insert into facts_monthly_location(upload_id, month, location_id, total_volume, mh_net_payout)
  select
    v_upload_id,
    date_trunc('month', p_month)::date,
    l.id,
    p_volumes[i],
    p_mh_nets[i]
  from generate_subscripts(p_locations,1) g(i)
  join locations l on lower(l.name) = lower(trim(p_locations[i]));

  select count(*) into v_zero
  from facts_monthly_location
  where upload_id = v_upload_id and is_zero_volume;

  return json_build_object(
    'upload_id', v_upload_id,
    'inserted', v_rows,
    'new_locations', coalesce(v_new_locs,0),
    'zero_count', v_zero
  );
end $$;