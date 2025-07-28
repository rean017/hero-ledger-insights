-- Add policies to allow guest uploads
-- Allow anyone to insert upload records
CREATE POLICY "Allow guest uploads" 
ON public.file_uploads 
FOR INSERT 
TO anon 
WITH CHECK (true);

-- Allow anyone to update upload records (for status updates)
CREATE POLICY "Allow guest upload updates" 
ON public.file_uploads 
FOR UPDATE 
TO anon 
USING (true);

-- Allow anyone to read upload records
CREATE POLICY "Allow guest upload reads" 
ON public.file_uploads 
FOR SELECT 
TO anon 
USING (true);

-- Allow anyone to delete upload records
CREATE POLICY "Allow guest upload deletes" 
ON public.file_uploads 
FOR DELETE 
TO anon 
USING (true);

-- Allow guest transactions
CREATE POLICY "Allow guest transactions" 
ON public.transactions 
FOR ALL 
TO anon 
USING (true);

-- Allow guest location operations
CREATE POLICY "Allow guest locations" 
ON public.locations 
FOR ALL 
TO anon 
USING (true);

-- Allow guest agent operations
CREATE POLICY "Allow guest agents" 
ON public.agents 
FOR ALL 
TO anon 
USING (true);

-- Allow guest assignment operations
CREATE POLICY "Allow guest assignments" 
ON public.location_agent_assignments 
FOR ALL 
TO anon 
USING (true);

-- Allow guest P&L operations
CREATE POLICY "Allow guest pl_data" 
ON public.pl_data 
FOR ALL 
TO anon 
USING (true);