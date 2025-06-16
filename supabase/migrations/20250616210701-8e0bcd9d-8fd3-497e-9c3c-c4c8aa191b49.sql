
-- Add franchise column to locations table
ALTER TABLE public.locations ADD COLUMN is_franchise BOOLEAN DEFAULT false;

-- Add index for franchise filtering
CREATE INDEX idx_locations_is_franchise ON public.locations(is_franchise);
