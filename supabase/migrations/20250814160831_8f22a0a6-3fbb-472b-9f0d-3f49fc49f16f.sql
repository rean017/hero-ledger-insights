-- ===== IMPLEMENT ROLE-BASED ACCESS CONTROLS =====
-- Restrict financial data access to admin users only

-- 1. UPDATE TRANSACTIONS TABLE - Only admins can access financial transaction data
DROP POLICY IF EXISTS "Authenticated users can view transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can delete transactions" ON public.transactions;

CREATE POLICY "Only admins can view transactions" 
ON public.transactions 
FOR SELECT 
TO authenticated 
USING (public.get_current_user_role() = 'admin');

CREATE POLICY "Only admins can manage transactions" 
ON public.transactions 
FOR ALL 
TO authenticated 
USING (public.get_current_user_role() = 'admin') 
WITH CHECK (public.get_current_user_role() = 'admin');

-- 2. UPDATE FACTS TABLES - Only admins can access aggregated financial data
DROP POLICY IF EXISTS "Authenticated users can view facts" ON public.facts;
DROP POLICY IF EXISTS "Authenticated users can manage facts" ON public.facts;

CREATE POLICY "Only admins can view facts" 
ON public.facts 
FOR SELECT 
TO authenticated 
USING (public.get_current_user_role() = 'admin');

CREATE POLICY "Only admins can manage facts" 
ON public.facts 
FOR ALL 
TO authenticated 
USING (public.get_current_user_role() = 'admin') 
WITH CHECK (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "Authenticated users can view facts monthly location" ON public.facts_monthly_location;
DROP POLICY IF EXISTS "Authenticated users can manage facts monthly location" ON public.facts_monthly_location;

CREATE POLICY "Only admins can view facts monthly location" 
ON public.facts_monthly_location 
FOR SELECT 
TO authenticated 
USING (public.get_current_user_role() = 'admin');

CREATE POLICY "Only admins can manage facts monthly location" 
ON public.facts_monthly_location 
FOR ALL 
TO authenticated 
USING (public.get_current_user_role() = 'admin') 
WITH CHECK (public.get_current_user_role() = 'admin');

-- 3. UPDATE MONTHLY DATA - Only admins can access business performance metrics
DROP POLICY IF EXISTS "Authenticated users can view monthly data" ON public.monthly_data;
DROP POLICY IF EXISTS "Authenticated users can manage monthly data" ON public.monthly_data;

CREATE POLICY "Only admins can view monthly data" 
ON public.monthly_data 
FOR SELECT 
TO authenticated 
USING (public.get_current_user_role() = 'admin');

CREATE POLICY "Only admins can manage monthly data" 
ON public.monthly_data 
FOR ALL 
TO authenticated 
USING (public.get_current_user_role() = 'admin') 
WITH CHECK (public.get_current_user_role() = 'admin');

-- 4. UPDATE UPLOADS - Only admins can access upload metadata
DROP POLICY IF EXISTS "Authenticated users can view uploads" ON public.uploads;
DROP POLICY IF EXISTS "Authenticated users can manage uploads" ON public.uploads;

CREATE POLICY "Only admins can view uploads" 
ON public.uploads 
FOR SELECT 
TO authenticated 
USING (public.get_current_user_role() = 'admin');

CREATE POLICY "Only admins can manage uploads" 
ON public.uploads 
FOR ALL 
TO authenticated 
USING (public.get_current_user_role() = 'admin') 
WITH CHECK (public.get_current_user_role() = 'admin');

-- 5. AGENTS AND LOCATIONS - Keep accessible to authenticated users (less sensitive operational data)
-- These remain as-is since they contain operational data that might be needed by regular users

-- 6. Fix function search_path security issue
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.get_current_user_role() = 'admin';
$function$;

CREATE OR REPLACE FUNCTION public.set_user_admin(user_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    target_user_id uuid;
BEGIN
    -- Get the user ID from the email
    SELECT id INTO target_user_id 
    FROM auth.users 
    WHERE email = user_email;
    
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', user_email;
    END IF;
    
    -- Update profile role to admin
    UPDATE public.profiles 
    SET role = 'admin' 
    WHERE id = target_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile for user % not found', user_email;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;