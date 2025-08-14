-- Enable extension for UUIDs if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Update agents table structure
ALTER TABLE public.agents 
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Case-insensitive unique constraint on name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_agents_name_ci_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_agents_name_ci_unique ON public.agents (lower(name));
  END IF;
END$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END$$;

-- Add trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tg_agents_updated_at'
  ) THEN
    CREATE TRIGGER tg_agents_updated_at
    BEFORE UPDATE ON public.agents
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
  END IF;
END$$;

-- Turn on RLS (if not already)
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS agents_select_all ON public.agents;
DROP POLICY IF EXISTS agents_insert_all ON public.agents;
DROP POLICY IF EXISTS agents_update_all ON public.agents;
DROP POLICY IF EXISTS agents_delete_all ON public.agents;

-- Create comprehensive RLS policies
CREATE POLICY agents_select_all ON public.agents
  FOR SELECT USING (true);

CREATE POLICY agents_insert_all ON public.agents
  FOR INSERT WITH CHECK (true);

CREATE POLICY agents_update_all ON public.agents
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY agents_delete_all ON public.agents
  FOR DELETE USING (true);

-- RPC functions with friendly errors and upsert behavior
CREATE OR REPLACE FUNCTION public.mh_create_agent(p_name text, p_notes text DEFAULT NULL)
RETURNS public.agents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.agents;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Agent name is required';
  END IF;

  INSERT INTO public.agents(name, notes)
  VALUES (trim(p_name), NULLIF(p_notes,''))
  ON CONFLICT (lower(name))
  DO UPDATE SET notes = EXCLUDED.notes, active = true
  RETURNING * INTO v_agent;

  RETURN v_agent;
END;
$$;

CREATE OR REPLACE FUNCTION public.mh_update_agent(p_id uuid, p_name text, p_notes text, p_active boolean DEFAULT NULL)
RETURNS public.agents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.agents;
BEGIN
  UPDATE public.agents
  SET
    name = CASE WHEN p_name IS NULL OR length(trim(p_name))=0 THEN name ELSE trim(p_name) END,
    notes = p_notes,
    active = COALESCE(p_active, active)
  WHERE id = p_id
  RETURNING * INTO v_agent;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  RETURN v_agent;
END;
$$;

CREATE OR REPLACE FUNCTION public.mh_delete_agent(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.agents WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;
END;
$$;