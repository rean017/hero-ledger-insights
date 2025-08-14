-- Ensure the table/columns exist with the right types
-- (adjust table name if yours differs)
ALTER TABLE public.agent_location_terms
  ALTER COLUMN location_id TYPE uuid USING location_id::uuid,
  ALTER COLUMN agent_id TYPE uuid USING agent_id::uuid;

-- Rebuild FKs (idempotent)
ALTER TABLE public.agent_location_terms
  DROP CONSTRAINT IF EXISTS agent_location_terms_location_id_fkey;
ALTER TABLE public.agent_location_terms
  ADD CONSTRAINT agent_location_terms_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;

ALTER TABLE public.agent_location_terms
  DROP CONSTRAINT IF EXISTS agent_location_terms_agent_id_fkey;
ALTER TABLE public.agent_location_terms
  ADD CONSTRAINT agent_location_terms_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;

-- Optional: prevent dup terms for same (location, agent)
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_location_terms
  ON public.agent_location_terms(location_id, agent_id);

-- Strict/primary RPC: expects UUIDs
CREATE OR REPLACE FUNCTION public.mh_set_location_agent_term(
  p_location_id uuid,
  p_agent_id uuid,
  p_bps integer
) RETURNS public.agent_location_terms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.agent_location_terms;
BEGIN
  IF p_bps IS NULL OR p_bps < 0 OR p_bps > 1000 THEN
    RAISE EXCEPTION 'BPS must be between 0 and 1000';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id) THEN
    RAISE EXCEPTION 'Unknown location_id %', p_location_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE id = p_agent_id) THEN
    RAISE EXCEPTION 'Unknown agent_id %', p_agent_id;
  END IF;

  INSERT INTO public.agent_location_terms(location_id, agent_id, bps)
  VALUES (p_location_id, p_agent_id, p_bps)
  ON CONFLICT (location_id, agent_id)
  DO UPDATE SET bps = excluded.bps, updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Fuzzy helper: accepts either UUID or an exact location name
CREATE OR REPLACE FUNCTION public.mh_set_location_agent_term_fuzzy(
  p_location text,          -- either UUID string or *exact* location name
  p_agent_id uuid,
  p_bps integer
) RETURNS public.agent_location_terms
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_location_id uuid;
  v_row public.agent_location_terms;
BEGIN
  -- Try UUID cast first
  BEGIN
    v_location_id := p_location::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_location_id := null;
  END;

  IF v_location_id IS NULL THEN
    -- Resolve by exact name; raise on 0/2+ matches so we don't guess
    SELECT id INTO v_location_id
    FROM public.locations
    WHERE name = p_location
    LIMIT 1;

    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'Location not found by name: %', p_location;
    END IF;
  END IF;

  -- Delegate to strict UUID RPC
  SELECT * INTO v_row
  FROM public.mh_set_location_agent_term(v_location_id, p_agent_id, p_bps);

  RETURN v_row;
END;
$$;

-- Diagnostics: see what your UI row actually maps to
CREATE OR REPLACE FUNCTION public.mh_debug_location_ids(p_name text)
RETURNS TABLE(found_id uuid, exact_count integer, ilike_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH exact AS (SELECT id FROM public.locations WHERE name = p_name),
       ilike AS (SELECT id FROM public.locations WHERE name ILIKE p_name)
  SELECT
    (SELECT id FROM exact LIMIT 1) as found_id,
    (SELECT count(*)::integer FROM exact) as exact_count,
    (SELECT count(*)::integer FROM ilike) as ilike_count;
$$;