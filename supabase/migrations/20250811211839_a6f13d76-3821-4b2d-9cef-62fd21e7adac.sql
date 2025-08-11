-- Simplify the database schema for streamlined commission tracking

-- Drop unnecessary tables and recreate with simplified structure
DROP TABLE IF EXISTS location_agent_assignments CASCADE;
DROP TABLE IF EXISTS file_uploads CASCADE;
DROP TABLE IF EXISTS pl_data CASCADE;

-- Recreate simplified tables
CREATE TABLE public.monthly_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL,
  location_name TEXT NOT NULL,
  volume NUMERIC NOT NULL DEFAULT 0,
  agent_payout NUMERIC NOT NULL DEFAULT 0,
  agent_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(month, location_name) -- Prevent duplicate locations per month
);

-- Enable RLS
ALTER TABLE public.monthly_data ENABLE ROW LEVEL SECURITY;

-- Create policy for open access (adjust based on auth needs)
CREATE POLICY "Allow all operations on monthly_data" 
ON public.monthly_data 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Simplify agents table (remove unnecessary fields)
ALTER TABLE public.agents DROP COLUMN IF EXISTS is_active CASCADE;

-- Simplify locations table (remove unnecessary fields)  
ALTER TABLE public.locations DROP COLUMN IF EXISTS is_franchise CASCADE;
ALTER TABLE public.locations DROP COLUMN IF EXISTS account_id CASCADE;
ALTER TABLE public.locations DROP COLUMN IF EXISTS account_type CASCADE;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_monthly_data_updated_at
BEFORE UPDATE ON public.monthly_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_monthly_data_month ON public.monthly_data(month);
CREATE INDEX idx_monthly_data_agent ON public.monthly_data(agent_name);
CREATE INDEX idx_monthly_data_location ON public.monthly_data(location_name);