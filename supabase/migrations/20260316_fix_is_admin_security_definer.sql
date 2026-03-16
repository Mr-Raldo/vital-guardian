-- ============================================================
-- Fix RLS infinite-recursion in is_admin() and is_doctor_or_admin()
--
-- Without SECURITY DEFINER, these functions run as the calling user.
-- When they query user_roles (which has RLS enabled), the same RLS
-- policy fires again, calling is_admin() recursively. PostgreSQL
-- detects the cycle and throws "infinite recursion detected in policy
-- for relation user_roles" → PostgREST returns 400.
--
-- SECURITY DEFINER makes the function run as its owner (postgres),
-- bypassing RLS on the inner query and breaking the cycle.
-- SET search_path locks the search path for security.
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_doctor_or_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'doctor')
  );
$$;
