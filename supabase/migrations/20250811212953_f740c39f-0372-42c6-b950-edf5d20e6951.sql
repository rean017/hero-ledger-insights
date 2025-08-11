-- Update schema for 3-column upload system with proper facts table

-- Create locations table if it doesn't exist (simplified)
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create facts table for monthly data
CREATE TABLE IF NOT EXISTS public.facts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  total_volume NUMERIC NOT NULL DEFAULT 0,
  mh_net_payout NUMERIC NOT NULL DEFAULT 0,
  is_zero_volume BOOLEAN GENERATED ALWAYS AS (total_volume = 0) STORED,
  upload_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(month, location_id)
);

-- Create upload_audits table
CREATE TABLE IF NOT EXISTS public.upload_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_filename TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  month DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_audits ENABLE ROW LEVEL SECURITY;

-- Create policies for open access (adjust based on auth needs)
CREATE POLICY "Allow all operations on locations" ON public.locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on facts" ON public.facts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on upload_audits" ON public.upload_audits FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_facts_month ON public.facts(month);
CREATE INDEX IF NOT EXISTS idx_facts_location_month ON public.facts(location_id, month);
CREATE INDEX IF NOT EXISTS idx_locations_name_lower ON public.locations(LOWER(name));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_locations_updated_at
BEFORE UPDATE ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_facts_updated_at
BEFORE UPDATE ON public.facts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();