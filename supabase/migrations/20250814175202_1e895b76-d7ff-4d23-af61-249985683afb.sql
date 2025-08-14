-- Create agent_location_terms table for tracking agent assignments
CREATE TABLE IF NOT EXISTS public.agent_location_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations_new(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  bps integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(location_id, agent_id)
);

-- Enable RLS on agent_location_terms
ALTER TABLE public.agent_location_terms ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for agent_location_terms
CREATE POLICY "Authenticated users can view agent location terms" 
ON public.agent_location_terms 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can manage agent location terms" 
ON public.agent_location_terms 
FOR ALL 
USING (true)
WITH CHECK (true);

-- View: summarized location metrics per month (adapted for existing schema)
CREATE OR REPLACE VIEW public.v_locations_month AS
SELECT
  l.id                          AS location_id,
  l.name                        AS location_name,
  TO_CHAR(fml.month, 'YYYY-MM') AS month,              -- Convert date to 'YYYY-MM' format
  COALESCE(fml.total_volume, 0) AS total_volume,
  COALESCE(fml.mh_net_payout, 0) AS agent_net_payout,
  -- Count of agents assigned (from agent_location_terms)
  COUNT(DISTINCT alt.agent_id)  AS agent_count
FROM public.locations_new l
LEFT JOIN public.facts_monthly_location fml
  ON fml.location_id = l.id
LEFT JOIN public.agent_location_terms alt
  ON alt.location_id = l.id
GROUP BY l.id, l.name, fml.month, fml.total_volume, fml.mh_net_payout;

-- Enhanced view with flags
CREATE OR REPLACE VIEW public.v_locations_month_with_flags AS
SELECT
  v.*,
  (v.total_volume = 0) AS is_zero_volume,
  -- Calculate margin ratio
  CASE 
    WHEN COALESCE(v.total_volume, 0) = 0 THEN 0
    ELSE (COALESCE(v.agent_net_payout, 0) / NULLIF(v.total_volume, 0))
  END AS margin_ratio
FROM public.v_locations_month v;

-- RPC: fetch locations for a month with filters + search (adapted for existing schema)
CREATE OR REPLACE FUNCTION public.mh_get_locations(
  p_month text DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_has_agents boolean DEFAULT NULL
)
RETURNS TABLE (
  location_id uuid,
  location_name text,
  month text,
  total_volume numeric,
  agent_net_payout numeric,
  agent_count bigint,
  is_zero_volume boolean,
  margin_ratio numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    v.location_id,
    v.location_name,
    v.month,
    v.total_volume,
    v.agent_net_payout,
    v.agent_count,
    (v.total_volume = 0) AS is_zero_volume,
    CASE 
      WHEN COALESCE(v.total_volume, 0) = 0 THEN 0
      ELSE (COALESCE(v.agent_net_payout, 0) / NULLIF(v.total_volume, 0))
    END AS margin_ratio
  FROM public.v_locations_month v
  WHERE (p_month IS NULL OR v.month = p_month)
    AND (p_query IS NULL OR v.location_name ILIKE '%' || p_query || '%')
    AND (p_has_agents IS NULL
         OR (p_has_agents = true  AND v.agent_count > 0)
         OR (p_has_agents = false AND COALESCE(v.agent_count, 0) = 0))
  ORDER BY v.total_volume DESC NULLS LAST, v.location_name ASC;
$$;

-- Ensure location names are unique & trimmed so uploads resolve correctly
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_new_name_unique
  ON public.locations_new (lower(trim(name)));