-- Hardened Locations RPC with left joins and exact month filtering
create or replace function public.mh_get_locations(
  p_month text,
  p_query text,
  p_has_agents boolean
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
  -- Show exactly what exists for the selected month
  select
    fml.location_id,
    fml.month,
    coalesce(fml.total_volume, 0)::numeric as total_volume,
    coalesce(fml.mh_net_payout, 0)::numeric as agent_net_payout
  from public.facts_monthly_location fml
  where fml.month = p_month  -- STRICT text equality, no date casting
),
locs as (
  select l.id as location_id,
         coalesce(l.name, 'Unknown') as location_name
  from public.locations l
),
agent_counts as (
  -- Count agents per location - if no agent table exists, this will return 0 rows
  select 
    fml.location_id,
    0::bigint as agent_count  -- placeholder since we don't have agent data yet
  from public.facts_monthly_location fml
  where fml.month = p_month
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
left join locs l on l.location_id = b.location_id
left join agent_counts ac on ac.location_id = b.location_id
where
  (p_query is null or l.location_name ilike '%' || p_query || '%')
  and (
    p_has_agents is null
    or (p_has_agents = true  and coalesce(ac.agent_count,0) > 0)
    or (p_has_agents = false and coalesce(ac.agent_count,0) = 0)
  )
order by b.total_volume desc nulls last, l.location_name asc;
$$;