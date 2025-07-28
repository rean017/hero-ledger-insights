-- After the admin user signs up, promote them to admin role
-- This will run after you create the admin@test.com account

-- Wait a moment for the signup to complete, then run this:
SELECT public.set_user_admin('admin@test.com');