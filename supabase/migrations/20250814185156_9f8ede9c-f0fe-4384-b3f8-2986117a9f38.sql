-- 1) See what months we actually have
-- This will help us understand the current state

-- 2) Create bullet-proof RPC that never hides facts
drop function if exists public.mh_get_locations(text, text, boolean);

create or replace function public.mh_get_locations(
  p_month text default null,
  p_query text default null,
  p_has_agents boolean default null
)
returns table (
  location_id uuid,
  location_name text,
  month text,
  total_volume numeric,
  agent_net_payout numeric,
  agent_count bigint,
  is_zero_volume boolean,
  margin_ratio numeric
)
language sql
stable
as $$
with base as (
  select
    f.location_id,
    to_char(f.month, 'YYYY-MM') as month,
    coalesce(f.total_volume,0)::numeric as total_volume,
    coalesce(f.mh_net_payout,0)::numeric as agent_net_payout
  from public.facts_monthly_location f
  where (p_month is null or to_char(f.month, 'YYYY-MM') = p_month)  -- exact text equality
),
locs as (
  select
    l.id as location_id,
    coalesce(l.name, 'Unknown') as location_name
  from public.locations l
),
agent_counts as (
  -- Count agents per location from agent_location_terms table
  select 
    alt.location_id,
    count(*)::bigint as agent_count
  from public.agent_location_terms alt
  group by alt.location_id
)
select
  b.location_id,
  coalesce(l.location_name, 'Unknown') as location_name,
  b.month,
  b.total_volume,
  b.agent_net_payout,
  coalesce(ac.agent_count, 0) as agent_count,
  (b.total_volume = 0) as is_zero_volume,
  case 
    when coalesce(b.total_volume, 0) = 0 then 0
    else (coalesce(b.agent_net_payout, 0) / nullif(b.total_volume, 0))
  end as margin_ratio
from base b
left join locs l on l.location_id = b.location_id  -- LEFT JOIN prevents hiding facts
left join agent_counts ac on ac.location_id = b.location_id
where
  (p_query is null or l.location_name ilike '%'||p_query||'%')
  and (
    p_has_agents is null
    or (p_has_agents = true  and coalesce(ac.agent_count,0) > 0)
    or (p_has_agents = false and coalesce(ac.agent_count,0) = 0)
  )
order by b.total_volume desc nulls last, l.location_name asc;
$$;