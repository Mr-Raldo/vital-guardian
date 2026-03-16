-- ============================================================
-- Add bed_number to vitals + auto-resolve patient from bed
-- + allow unauthenticated inserts for Arduino hardware
-- ============================================================

-- 1. Add bed_number column
ALTER TABLE public.vitals ADD COLUMN IF NOT EXISTS bed_number TEXT;

-- 2. Trigger: when Arduino inserts a vital with bed_number but no patient_id,
--    automatically look up the active patient assigned to that bed.
CREATE OR REPLACE FUNCTION public.resolve_patient_from_bed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only resolve if patient_id is missing but bed_number is provided
  IF NEW.patient_id IS NULL AND NEW.bed_number IS NOT NULL THEN
    SELECT id INTO NEW.patient_id
    FROM public.patients
    WHERE bed_number = NEW.bed_number
      AND is_active = true
    ORDER BY admission_date DESC
    LIMIT 1;
  END IF;

  -- If still no patient found, abort the insert cleanly
  IF NEW.patient_id IS NULL THEN
    RAISE EXCEPTION 'No active patient found for bed: %', NEW.bed_number;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vitals_resolve_patient ON public.vitals;
CREATE TRIGGER vitals_resolve_patient
  BEFORE INSERT ON public.vitals
  FOR EACH ROW EXECUTE FUNCTION public.resolve_patient_from_bed();

-- 3. Allow Arduino (unauthenticated / anon role) to insert vitals
--    The anon key is safe here — it can only INSERT, not read other patients' data.
DROP POLICY IF EXISTS "Authenticated can insert vitals" ON public.vitals;
DROP POLICY IF EXISTS "Anyone can insert vitals" ON public.vitals;
DROP POLICY IF EXISTS "Authenticated or service can insert vitals" ON public.vitals;

CREATE POLICY "Anyone can insert vitals" ON public.vitals
  FOR INSERT WITH CHECK (true);
