-- ========== PREREQS ==========
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ========== TABLES ==========

-- Locations table (one row per DBA/location)
create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  dba         text not null,
  created_at  timestamptz not null default now()
);

-- Add a normalized column we can enforce uniqueness on
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='locations' and column_name='dba_norm'
  ) then
    alter table public.locations
      add column dba_norm text generated always as (lower(dba)) stored;
  end if;
end$$;

-- Uniqueness required by ON CONFLICT for upserting locations (case-insensitive DBA)
do $$
begin
  alter table public.locations add constraint uq_locations_dba_norm unique (dba_norm);
exception when duplicate_table then
  -- already exists
  null;
end$$;

-- Monthly facts table (aggregated per month + location)
create table if not exists public.facts_monthly_location (
  id            bigserial primary key,
  month         date not null,
  location_id   uuid not null references public.locations(id) on delete cascade,
  total_volume  numeric(18,2) not null default 0,
  agent_net     numeric(18,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- auto flag for zero-volume rows
  is_zero_volume boolean generated always as (total_volume = 0) stored
);

-- Uniqueness required by ON CONFLICT for upserting monthly facts
create unique index if not exists ux_fml_month_loc
  on public.facts_monthly_location (month, location_id);

-- (Optional) uploads log
create table if not exists public.uploads (
  id             bigserial primary key,
  month          date not null,
  filename       text,
  rows_inserted  int default 0,
  new_locations  int default 0,
  zero_count     int default 0,
  created_at     timestamptz not null default now()
);

-- ========== RPC FUNCTION ==========

-- This RPC is what your app/edge function calls
create or replace function public.mh_upload_master(
  p_month date,
  p_filename text,
  p_locations text[],
  p_volumes numeric[],
  p_mh_nets numeric[]
) returns json
language plpgsql
as $$
declare
  n int := coalesce(array_length(p_locations,1), 0);
  i int;
  v_loc_id uuid;
  v_new_locs int := 0;
  v_zero int := 0;
begin
  -- basic safety
  if n = 0 then
    raise exception 'No locations provided';
  end if;
  if array_length(p_volumes,1) is distinct from n
     or array_length(p_mh_nets,1) is distinct from n then
    raise exception 'Array length mismatch';
  end if;

  for i in 1..n loop
    -- 1) Upsert location (case-insensitive on DBA)
    --    We count a "new" location only when an insert actually happens.
    with ins as (
      insert into public.locations(dba)
      values (p_locations[i])
      on conflict (dba_norm) do nothing
      returning id
    )
    select id into v_loc_id from ins;

    if v_loc_id is null then
      -- existed already; get its id
      select id into v_loc_id
      from public.locations
      where dba_norm = lower(p_locations[i]);
      -- keep the latest casing for display
      update public.locations set dba = p_locations[i] where id = v_loc_id;
    else
      v_new_locs := v_new_locs + 1;
    end if;

    -- 2) Upsert monthly facts
    insert into public.facts_monthly_location(month, location_id, total_volume, agent_net, updated_at)
    values (p_month, v_loc_id, coalesce(p_volumes[i],0), coalesce(p_mh_nets[i],0), now())
    on conflict (month, location_id) do update
      set total_volume = excluded.total_volume,
          agent_net    = excluded.agent_net,
          updated_at   = now();

    if coalesce(p_volumes[i],0) = 0 then
      v_zero := v_zero + 1;
    end if;
  end loop;

  -- 3) Log the upload
  insert into public.uploads(month, filename, rows_inserted, new_locations, zero_count)
  values (p_month, p_filename, n, v_new_locs, v_zero);

  return json_build_object(
    'inserted', n,
    'new_locations', v_new_locs,
    'zero_count', v_zero
  );
end
$$;

-- Optional: relax RLS for these tables while you test (remove if you use RLS)
alter table public.locations               disable row level security;
alter table public.facts_monthly_location  disable row level security;
alter table public.uploads                 disable row level security;