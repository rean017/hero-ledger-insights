
-- Add location_id column to transactions table
ALTER TABLE public.transactions 
ADD COLUMN location_id uuid REFERENCES public.locations(id);

-- Add index for better performance on location_id lookups
CREATE INDEX idx_transactions_location_id ON public.transactions(location_id);
