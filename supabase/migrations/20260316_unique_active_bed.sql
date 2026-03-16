-- Prevent two active patients from occupying the same bed in the same ward.
-- Partial index: only applies when is_active = true and bed_number is not null.

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_bed_per_ward
  ON patients (ward, bed_number)
  WHERE is_active = true AND bed_number IS NOT NULL AND ward IS NOT NULL;

-- Also block same bed_number globally when ward is null (unassigned ward)
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_bed_no_ward
  ON patients (bed_number)
  WHERE is_active = true AND bed_number IS NOT NULL AND ward IS NULL;
