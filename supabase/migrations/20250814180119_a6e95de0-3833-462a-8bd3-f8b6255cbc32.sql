-- Normalize/check month format 'YYYY-MM' once
CREATE OR REPLACE VIEW public.v_available_months AS
SELECT DISTINCT fml.month
FROM public.facts_monthly_location fml
WHERE fml.month ~ '^\d{4}-\d{2}$'
ORDER BY fml.month DESC;

-- Simple RPC to fetch months
CREATE OR REPLACE FUNCTION public.mh_get_available_months()
RETURNS TABLE (month text)
LANGUAGE sql
STABLE
AS $$
  SELECT month FROM public.v_available_months;
$$;

-- Make sure reads are allowed (RLS enabled earlier)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='facts_monthly_location'
      AND policyname='read_fml_internal'
  ) THEN
    CREATE POLICY read_fml_internal ON public.facts_monthly_location
      FOR SELECT USING (true);
  END IF;
END $$;