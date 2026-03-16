-- ============================================================
-- All authenticated users (nurses, doctors, admins) can see
-- all active patients. Nurses are no longer restricted to
-- only their assigned patients.
-- ============================================================

DROP POLICY IF EXISTS "patients_select" ON patients;

CREATE POLICY "patients_select" ON patients
  FOR SELECT USING (auth.uid() IS NOT NULL);
