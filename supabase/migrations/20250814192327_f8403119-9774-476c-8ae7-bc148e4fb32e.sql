-- Create RPC for agent monthly commission reports
CREATE OR REPLACE FUNCTION public.mh_agent_monthly_report(
  p_agent_id uuid,
  p_month_key text
)
RETURNS TABLE (
  location_id uuid,
  location_name text,
  month_key text,
  total_volume numeric,
  bps integer,
  commission numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH latest_terms AS (
    SELECT DISTINCT ON (t.agent_id, t.location_id)
           t.agent_id,
           t.location_id,
           t.bps,
           t.created_at
    FROM public.agent_location_terms t
    WHERE t.agent_id = p_agent_id
    ORDER BY t.agent_id, t.location_id, t.created_at DESC
  )
  SELECT
    f.location_id,
    COALESCE(l.name, 'Unknown') as location_name,
    TO_CHAR(f.month, 'YYYY-MM') as month_key,
    COALESCE(f.total_volume, 0) as total_volume,
    lt.bps,
    ROUND(COALESCE(f.total_volume,0) * (COALESCE(lt.bps,0)::numeric / 10000), 2) as commission
  FROM public.facts_monthly_location f
  JOIN public.locations l ON l.id = f.location_id
  JOIN latest_terms lt ON lt.location_id = f.location_id
  WHERE TO_CHAR(f.month, 'YYYY-MM') = p_month_key
  ORDER BY l.name ASC;
$$;