-- ===== CRITICAL SECURITY FIX =====
-- Remove dangerous public access policies and implement proper authentication-based RLS

-- 1. DROP DANGEROUS POLICIES that allow public access to sensitive data
DROP POLICY IF EXISTS "Allow guest transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow guest agents" ON public.agents;
DROP POLICY IF EXISTS "Allow guest locations" ON public.locations;
DROP POLICY IF EXISTS "Allow all operations on monthly_data" ON public.monthly_data;
DROP POLICY IF EXISTS "Allow all operations on facts" ON public.facts;
DROP POLICY IF EXISTS "Allow all operations on facts_monthly_location" ON public.facts_monthly_location;
DROP POLICY IF EXISTS "Allow all operations on locations" ON public.locations;
DROP POLICY IF EXISTS "Allow all operations on uploads" ON public.uploads;
DROP POLICY IF EXISTS "Allow all operations on locations_new" ON public.locations_new;

-- 2. CREATE SECURE POLICIES for transactions table
CREATE POLICY "Authenticated users can view transactions" 
ON public.transactions 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can insert transactions" 
ON public.transactions 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update transactions" 
ON public.transactions 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete transactions" 
ON public.transactions 
FOR DELETE 
TO authenticated 
USING (true);

-- 3. CREATE SECURE POLICIES for agents table
CREATE POLICY "Authenticated users can view agents" 
ON public.agents 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage agents" 
ON public.agents 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 4. CREATE SECURE POLICIES for locations table
CREATE POLICY "Authenticated users can view locations" 
ON public.locations 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage locations" 
ON public.locations 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 5. CREATE SECURE POLICIES for monthly_data table
CREATE POLICY "Authenticated users can view monthly data" 
ON public.monthly_data 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage monthly data" 
ON public.monthly_data 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 6. CREATE SECURE POLICIES for facts table
CREATE POLICY "Authenticated users can view facts" 
ON public.facts 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage facts" 
ON public.facts 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 7. CREATE SECURE POLICIES for facts_monthly_location table
CREATE POLICY "Authenticated users can view facts monthly location" 
ON public.facts_monthly_location 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage facts monthly location" 
ON public.facts_monthly_location 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 8. CREATE SECURE POLICIES for uploads table
CREATE POLICY "Authenticated users can view uploads" 
ON public.uploads 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage uploads" 
ON public.uploads 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 9. CREATE SECURE POLICIES for locations_new table (if it exists)
DROP POLICY IF EXISTS "Allow all operations on locations_new" ON public.locations_new;

CREATE POLICY "Authenticated users can view locations new" 
ON public.locations_new 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can manage locations new" 
ON public.locations_new 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);