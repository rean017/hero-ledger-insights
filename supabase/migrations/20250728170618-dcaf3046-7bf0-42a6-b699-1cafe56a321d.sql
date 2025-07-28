-- Fix RLS policies to work without authentication
-- Since this is now an internal tool without auth, we need to allow anonymous access

-- Drop the admin-only policies and replace with anonymous-friendly ones
DROP POLICY IF EXISTS "Admins can manage transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can manage locations" ON public.locations;
DROP POLICY IF EXISTS "Admins can manage agents" ON public.agents;
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.location_agent_assignments;
DROP POLICY IF EXISTS "Admins can manage pl_data" ON public.pl_data;
DROP POLICY IF EXISTS "Admins can manage uploads" ON public.file_uploads;

-- Create new policies that allow all operations for anonymous users
CREATE POLICY "Allow all operations on transactions" 
ON public.transactions 
FOR ALL 
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on locations" 
ON public.locations 
FOR ALL 
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on agents" 
ON public.agents 
FOR ALL 
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on assignments" 
ON public.location_agent_assignments 
FOR ALL 
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on pl_data" 
ON public.pl_data 
FOR ALL 
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on uploads" 
ON public.file_uploads 
FOR ALL 
TO anon, authenticated
USING (true)
WITH CHECK (true);