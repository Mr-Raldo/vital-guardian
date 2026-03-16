-- ============================================================
-- Allow all authenticated users to read profiles and user_roles
-- Needed so doctors/admins can see the full nurse list when
-- assigning a nurse to a patient, and so AdminDashboard can
-- list all staff accounts regardless of role.
-- ============================================================

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "user_roles_select" ON user_roles;
CREATE POLICY "user_roles_select" ON user_roles
  FOR SELECT USING (auth.uid() IS NOT NULL);
