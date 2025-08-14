-- Create view for available months, converting date to YYYY-MM format
CREATE OR REPLACE VIEW public.v_available_months AS
SELECT DISTINCT TO_CHAR(fml.month, 'YYYY-MM') AS month
FROM public.facts_monthly_location fml
WHERE fml.month IS NOT NULL
ORDER BY TO_CHAR(fml.month, 'YYYY-MM') DESC;

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