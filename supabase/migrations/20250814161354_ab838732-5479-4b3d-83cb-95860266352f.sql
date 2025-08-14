-- Fix conflicting RLS policies on transactions table
-- Drop the overly permissive policy that allows all operations with 'true' condition
DROP POLICY IF EXISTS "Allow all operations on transactions" ON public.transactions;

-- The remaining admin-only policies will now properly protect the data:
-- "Only admins can view transactions" 
-- "Only admins can manage transactions"