-- Create admin user profile (after signup) and set role to admin
-- This will be used after the user signs up with admin@test.com

-- First, let's create a function to easily set a user as admin
CREATE OR REPLACE FUNCTION public.set_user_admin(user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles 
  SET role = 'admin'
  WHERE email = user_email;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User with email % not found in profiles table', user_email;
  END IF;
END;
$$;