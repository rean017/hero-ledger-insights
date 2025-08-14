-- ====== PREP ======
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ====== TABLES & KEYS ======

-- Locations (one per DBA)
create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  dba        text not null,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness for DBA
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='locations' and column_name='dba_norm'
  ) then
    alter table public.locations
      add column dba_norm text generated always as (lower(dba)) stored;
  end if;
exception when others then null;
end$$;

do $$
begin
  alter table public.locations add constraint uq_locations_dba_norm unique (dba_norm);
exception when duplicate_table then null;
end$$;

-- Uploads log
create table if not exists public.uploads (
  id            bigserial primary key,
  month         date not null,
  filename      text,
  rows_inserted int default 0,
  new_locations int default 0,
  zero_count    int default 0,
  created_at    timestamptz not null default now()
);

-- Facts by month/location
create table if not exists public.facts_monthly_location (
  id            bigserial primary key,
  month         date not null,
  location_id   uuid not null references public.locations(id) on delete cascade,
  total_volume  numeric(18,2) not null default 0,
  agent_net     numeric(18,2) not null default 0,
  upload_id     bigint not null references public.uploads(id),  -- must be set by RPC
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  is_zero_volume boolean generated always as (total_volume = 0) stored
);

-- Upsert key for facts
create unique index if not exists ux_fml_month_loc
  on public.facts_monthly_location (month, location_id);

-- If you have old rows with NULL upload_id, backfill them once so NOT NULL is satisfied
do $$
declare v_dummy bigint;
begin
  if exists (select 1 from public.facts_monthly_location where upload_id is null) then
    insert into public.uploads(month, filename, rows_inserted, new_locations, zero_count)
    values (current_date, 'legacy_backfill', 0, 0, 0)
    returning id into v_dummy;

    update public.facts_monthly_location
    set upload_id = v_dummy
    where upload_id is null;
  end if;
end$$;

-- ====== RPC: ALWAYS sets upload_id and uses proper ON CONFLICT keys ======

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
  v_upload_id bigint;
begin
  if n = 0 then
    raise exception 'No locations provided';
  end if;
  if array_length(p_volumes,1) is distinct from n
     or array_length(p_mh_nets,1) is distinct from n then
    raise exception 'Array length mismatch';
  end if;

  -- 1) create the upload log row first and capture its id
  insert into public.uploads(month, filename, rows_inserted, new_locations, zero_count)
  values (p_month, p_filename, 0, 0, 0)
  returning id into v_upload_id;

  -- 2) loop rows and upsert
  for i in 1..n loop
    -- upsert location by case-insensitive DBA
    with ins as (
      insert into public.locations(dba)
      values (p_locations[i])
      on conflict (dba_norm) do nothing
      returning id
    )
    select id into v_loc_id from ins;

    if v_loc_id is null then
      select id into v_loc_id
      from public.locations
      where dba_norm = lower(p_locations[i]);

      -- keep latest casing
      update public.locations set dba = p_locations[i] where id = v_loc_id;
    else
      v_new_locs := v_new_locs + 1;
    end if;

    -- upsert facts WITH upload_id set
    insert into public.facts_monthly_location(
      month, location_id, total_volume, agent_net, upload_id, updated_at
    )
    values (
      p_month, v_loc_id,
      coalesce(p_volumes[i],0),
      coalesce(p_mh_nets[i],0),
      v_upload_id,
      now()
    )
    on conflict (month, location_id) do update
      set total_volume = excluded.total_volume,
          agent_net    = excluded.agent_net,
          upload_id    = excluded.upload_id,  -- keep last upload reference
          updated_at   = now();

    if coalesce(p_volumes[i],0) = 0 then
      v_zero := v_zero + 1;
    end if;
  end loop;

  -- 3) finalize the uploads log counts
  update public.uploads
  set rows_inserted = n, new_locations = v_new_locs, zero_count = v_zero
  where id = v_upload_id;

  return json_build_object(
    'inserted', n,
    'new_locations', v_new_locs,
    'zero_count', v_zero,
    'upload_id', v_upload_id
  );
end
$$;

-- ====== OPTIONAL: disable RLS during setup/testing ======
alter table public.locations               disable row level security;
alter table public.facts_monthly_location  disable row level security;
alter table public.uploads                 disable row level security;