-- Helper: month start as date
CREATE OR REPLACE FUNCTION mh_month_start(p_month text)
RETURNS date 
LANGUAGE sql 
IMMUTABLE 
AS $$
  SELECT to_date(p_month || '-01', 'YYYY-MM-DD')
$$;

-- Helper: month end as date (inclusive)
CREATE OR REPLACE FUNCTION mh_month_end(p_month text)
RETURNS date 
LANGUAGE sql 
IMMUTABLE 
AS $$
  SELECT (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date
$$;

-- Main summary for Agent Management grid
CREATE OR REPLACE FUNCTION mh_agent_summary(p_month text)
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  location_count int,
  total_volume numeric,
  total_payout numeric,
  avg_bps numeric
) 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH month_bounds AS (
    SELECT mh_month_start(p_month) AS d_start,
           mh_month_end(p_month) AS d_end
  ),
  -- terms active in the selected month (indefinite by default)
  active_terms AS (
    SELECT t.agent_id, t.location_id, t.bps::numeric AS bps
    FROM agent_location_terms t, month_bounds b
    WHERE (t.created_at <= b.d_end)
  ),
  month_facts AS (
    SELECT f.location_id, f.total_volume::numeric AS vol
    FROM facts_monthly_location f
    WHERE to_char(f.month, 'YYYY-MM') = p_month
  ),
  joined AS (
    SELECT
      at.agent_id,
      COUNT(DISTINCT at.location_id)::int AS location_count,
      COALESCE(SUM(m.vol), 0)::numeric AS total_volume,
      COALESCE(SUM(m.vol * (at.bps / 10000.0)), 0)::numeric AS total_payout,
      CASE
        WHEN COALESCE(SUM(m.vol),0) = 0 THEN 0
        ELSE SUM(m.vol * at.bps)::numeric / SUM(m.vol)::numeric
      END AS avg_bps
    FROM active_terms at
    LEFT JOIN month_facts m ON m.location_id = at.location_id
    GROUP BY at.agent_id
  )
  SELECT
    a.id AS agent_id,
    a.name AS agent_name,
    COALESCE(j.location_count, 0) AS location_count,
    COALESCE(j.total_volume, 0) AS total_volume,
    COALESCE(j.total_payout, 0) AS total_payout,
    COALESCE(j.avg_bps, 0) AS avg_bps
  FROM agents a
  LEFT JOIN joined j ON j.agent_id = a.id
  ORDER BY a.name;
$$;

-- Detailed per-location breakdown for an Agent detail panel
CREATE OR REPLACE FUNCTION mh_agent_locations(p_month text, p_agent uuid)
RETURNS TABLE (
  location_id uuid,
  location_name text,
  bps numeric,
  volume numeric,
  payout numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH month_bounds AS (
    SELECT mh_month_start(p_month) AS d_start,
           mh_month_end(p_month) AS d_end
  ),
  active_terms AS (
    SELECT t.agent_id, t.location_id, t.bps::numeric AS bps
    FROM agent_location_terms t, month_bounds b
    WHERE t.agent_id = p_agent
  )
  SELECT
    l.id,
    l.name,
    at.bps,
    COALESCE(f.total_volume, 0)::numeric AS volume,
    COALESCE(f.total_volume * (at.bps / 10000.0), 0)::numeric AS payout
  FROM active_terms at
  JOIN locations l ON l.id = at.location_id
  LEFT JOIN facts_monthly_location f
    ON f.location_id = l.id AND to_char(f.month, 'YYYY-MM') = p_month
  ORDER BY l.name;
$$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_facts_month_loc ON facts_monthly_location(month, location_id);
CREATE INDEX IF NOT EXISTS idx_terms_agent_loc ON agent_location_terms(agent_id, location_id);