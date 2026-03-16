-- ============================================================
-- INTELLIGENT MULTI PARAMETER PATIENT MONITORING SYSTEM
-- Database Schema
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE app_role AS ENUM ('admin', 'nurse');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');
CREATE TYPE treatment_status AS ENUM ('active', 'completed', 'paused', 'cancelled');

-- ============================================================
-- PROFILES
-- Extends Supabase auth.users with display info
-- ============================================================

CREATE TABLE profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- USER ROLES
-- Maps auth users to their role (admin | nurse)
-- ============================================================

CREATE TABLE user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role       app_role NOT NULL DEFAULT 'nurse'
);

-- ============================================================
-- PATIENTS
-- Core patient demographic and admission data
-- ============================================================

CREATE TABLE patients (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name          TEXT NOT NULL,
  date_of_birth      DATE NOT NULL,
  gender             gender_type NOT NULL,
  id_number          TEXT UNIQUE,                          -- national ID / passport
  admission_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  discharge_date     DATE,
  ward               TEXT,
  bed_number         TEXT,
  diagnosis          TEXT,
  assigned_nurse_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes              TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- VITALS  (real-time, polled continuously)
-- Each row is one reading snapshot for a patient.
-- New rows are inserted by the monitoring device/service;
-- the frontend subscribes via Supabase Realtime (INSERT events).
-- ============================================================

CREATE TABLE vitals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Core vital signs
  temperature         NUMERIC(4,1),          -- °C  (critical > 37)
  heart_rate          SMALLINT,              -- bpm
  systolic_bp         SMALLINT,              -- mmHg
  diastolic_bp        SMALLINT,              -- mmHg
  oxygen_saturation   NUMERIC(5,2),          -- SpO₂ %  (critical < 94)
  respiratory_rate    SMALLINT,              -- breaths/min
  blood_glucose       NUMERIC(6,2),          -- mg/dL

  -- Computed / flagged server-side or by trigger
  is_critical         BOOLEAN NOT NULL DEFAULT FALSE
);

-- Auto-flag a reading as critical when thresholds are breached
CREATE OR REPLACE FUNCTION flag_critical_vital()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_critical := (
    (NEW.temperature       IS NOT NULL AND NEW.temperature > 37)       OR
    (NEW.heart_rate        IS NOT NULL AND (NEW.heart_rate < 50 OR NEW.heart_rate > 120))   OR
    (NEW.oxygen_saturation IS NOT NULL AND NEW.oxygen_saturation < 94) OR
    (NEW.systolic_bp       IS NOT NULL AND (NEW.systolic_bp < 90 OR NEW.systolic_bp > 180)) OR
    (NEW.respiratory_rate  IS NOT NULL AND (NEW.respiratory_rate < 10 OR NEW.respiratory_rate > 30))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER vitals_flag_critical
  BEFORE INSERT OR UPDATE ON vitals
  FOR EACH ROW EXECUTE FUNCTION flag_critical_vital();

-- Indexes for fast latest-vital lookups (used on dashboard per patient)
CREATE INDEX idx_vitals_patient_recorded
  ON vitals (patient_id, recorded_at DESC);

-- ============================================================
-- TREATMENTS
-- Clinical treatments/medications linked to a patient
-- ============================================================

CREATE TABLE treatments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  treatment_name  TEXT NOT NULL,
  description     TEXT,
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date        DATE,
  status          treatment_status NOT NULL DEFAULT 'active',
  prescribed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_treatments_patient ON treatments (patient_id, created_at DESC);

-- ============================================================
-- ALERT ACKNOWLEDGMENTS
-- Audit trail of who acknowledged each critical vital alert
-- ============================================================

CREATE TABLE alert_acknowledgments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vital_id         UUID NOT NULL REFERENCES vitals(id) ON DELETE CASCADE,
  patient_id       UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  acknowledged_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address       INET,
  user_agent       TEXT
);

CREATE INDEX idx_alert_ack_vital      ON alert_acknowledgments (vital_id);
CREATE INDEX idx_alert_ack_patient    ON alert_acknowledgments (patient_id);

-- ============================================================
-- ENABLE REALTIME (Supabase)
-- Vitals table must be in the realtime publication so the
-- frontend Supabase channel receives INSERT events instantly.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE vitals;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- profiles: each user sees/edits only their own row; admin sees all
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (user_id = auth.uid() OR is_admin());

-- user_roles: only admins manage roles; users can read their own
CREATE POLICY "user_roles_select" ON user_roles
  FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "user_roles_admin_all" ON user_roles
  FOR ALL USING (is_admin());

-- patients: any authenticated user can read; admin can write
CREATE POLICY "patients_select" ON patients
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "patients_insert" ON patients
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "patients_update" ON patients
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "patients_delete" ON patients
  FOR DELETE USING (is_admin());

-- vitals: any authenticated user can read/insert; delete admin only
CREATE POLICY "vitals_select" ON vitals
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "vitals_insert" ON vitals
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "vitals_delete" ON vitals
  FOR DELETE USING (is_admin());

-- treatments: any authenticated user can read/write
CREATE POLICY "treatments_select" ON treatments
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "treatments_insert" ON treatments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "treatments_update" ON treatments
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "treatments_delete" ON treatments
  FOR DELETE USING (is_admin());

-- alert_acknowledgments: any authenticated user can read/insert
CREATE POLICY "alert_ack_select" ON alert_acknowledgments
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "alert_ack_insert" ON alert_acknowledgments
  FOR INSERT WITH CHECK (acknowledged_by = auth.uid());

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGN UP (trigger on auth.users)
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, 'nurse');   -- default role; admin upgrades manually

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
