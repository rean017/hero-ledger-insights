
-- Create locations table to store unique locations from uploaded data
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  account_id TEXT,
  account_type TEXT DEFAULT 'Unknown',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create location_agent_assignments table to manage agent assignments and rates per location
CREATE TABLE public.location_agent_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000, -- Stores rate as decimal (e.g., 0.015 for 1.5%)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(location_id, agent_name)
);

-- Add RLS policies for locations
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on locations" 
  ON public.locations 
  FOR ALL 
  USING (true);

-- Add RLS policies for location_agent_assignments
ALTER TABLE public.location_agent_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on location_agent_assignments" 
  ON public.location_agent_assignments 
  FOR ALL 
  USING (true);

-- Create indexes for better performance
CREATE INDEX idx_locations_name ON public.locations(name);
CREATE INDEX idx_location_agent_assignments_location_id ON public.location_agent_assignments(location_id);
CREATE INDEX idx_location_agent_assignments_agent_name ON public.location_agent_assignments(agent_name);

-- Add trigger to update updated_at timestamp for locations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_locations_updated_at 
  BEFORE UPDATE ON public.locations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_location_agent_assignments_updated_at 
  BEFORE UPDATE ON public.location_agent_assignments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
