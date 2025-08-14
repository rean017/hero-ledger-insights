-- 1) Terms table: a location can have 0..N agents; each agent has one BPS for that location.
create table if not exists public.agent_location_terms (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null,
  agent_id uuid not null,
  bps integer not null check (bps >= 0 and bps <= 1000), -- basis points (0..1000 = 0..10%)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, agent_id)
);

-- FK (adjust to your actual table names/PKs)
alter table public.agent_location_terms
  add constraint fk_terms_location foreign key (location_id) references public.locations(id) on delete cascade;

alter table public.agent_location_terms
  add constraint fk_terms_agent foreign key (agent_id) references public.agents(id) on delete cascade;

-- Updated_at trigger
do $$
begin
  if not exists (select 1 from pg_trigger where tgname='tg_terms_updated_at') then
    create trigger tg_terms_updated_at
    before update on public.agent_location_terms
    for each row execute function public.update_updated_at_column();
  end if;
end$$;

-- Enable RLS + permissive policies for your admin app
alter table public.agent_location_terms enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='agent_location_terms' and policyname='terms_select_all') then
    create policy terms_select_all on public.agent_location_terms for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='agent_location_terms' and policyname='terms_insert_all') then
    create policy terms_insert_all on public.agent_location_terms for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='agent_location_terms' and policyname='terms_update_all') then
    create policy terms_update_all on public.agent_location_terms for update using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='agent_location_terms' and policyname='terms_delete_all') then
    create policy terms_delete_all on public.agent_location_terms for delete using (true);
  end if;
end$$;

-- Upsert a term (indefinite). If exists, update BPS.
create or replace function public.mh_set_location_agent_term(p_location_id uuid, p_agent_id uuid, p_bps int)
returns public.agent_location_terms
language plpgsql security definer set search_path=public as $$
declare v_row public.agent_location_terms;
begin
  if p_bps is null or p_bps < 0 or p_bps > 1000 then
    raise exception 'BPS must be between 0 and 1000';
  end if;

  insert into public.agent_location_terms(location_id, agent_id, bps)
  values (p_location_id, p_agent_id, p_bps)
  on conflict (location_id, agent_id)
  do update set bps = excluded.bps, updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- Remove a term (hard delete).
create or replace function public.mh_remove_location_agent_term(p_location_id uuid, p_agent_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.agent_location_terms
  where location_id = p_location_id and agent_id = p_agent_id;
end;
$$;

-- Get terms for a single location (for the edit modal).
create or replace function public.mh_get_location_terms(p_location_id uuid)
returns table(
  term_id uuid,
  agent_id uuid,
  agent_name text,
  bps int
) language sql security definer set search_path=public as $$
  select t.id, t.agent_id, a.name, t.bps
  from public.agent_location_terms t
  join public.agents a on a.id = t.agent_id
  where t.location_id = p_location_id
  order by lower(a.name);
$$;