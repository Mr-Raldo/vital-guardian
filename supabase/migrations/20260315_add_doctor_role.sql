-- ============================================================
-- Add 'doctor' to app_role enum
-- Doctors see all patients; nurses see only assigned patients
-- ============================================================

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'doctor';

-- Update is_admin helper (unchanged, kept for reference)
-- is_admin() already exists; no changes needed there.

-- Add a convenience helper used by RLS for "elevated" roles
CREATE OR REPLACE FUNCTION is_doctor_or_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'doctor')
  );
$$;

-- Nurses can only see their own assigned patients via RLS
-- Doctors and admins see all.  We drop and recreate the patients_select policy.
DROP POLICY IF EXISTS "patients_select" ON patients;

CREATE POLICY "patients_select" ON patients
  FOR SELECT USING (
    is_doctor_or_admin()
    OR assigned_nurse_id = auth.uid()
  );
