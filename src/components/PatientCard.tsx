import { useNavigate } from 'react-router-dom';
import { ECGLine } from './ECGLine';
import { Thermometer, Heart, Activity, Droplets, Gauge } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

interface PatientCardProps {
  patient: Tables<'patients'>;
  latestVital?: Tables<'vitals'> | null;
}

function vitalStatus(value: number | null | undefined, low: number, high: number): 'ok' | 'warning' | 'critical' | 'none' {
  if (value == null) return 'none';
  if (value < low || value > high) return 'critical';
  const okLow = low + (high - low) * 0.1;
  const okHigh = high - (high - low) * 0.1;
  if (value < okLow || value > okHigh) return 'warning';
  return 'ok';
}

function chipClass(status: 'ok' | 'warning' | 'critical' | 'none') {
  if (status === 'critical') return 'vital-chip-critical';
  if (status === 'warning') return 'vital-chip-warning';
  if (status === 'ok') return 'vital-chip-ok';
  return 'vital-chip';
}

function valueColor(status: 'ok' | 'warning' | 'critical' | 'none') {
  if (status === 'critical') return 'text-destructive';
  if (status === 'warning') return 'text-warning';
  if (status === 'ok') return 'text-success';
  return 'text-muted-foreground';
}

export function PatientCard({ patient, latestVital }: PatientCardProps) {
  const navigate = useNavigate();

  const tempStatus   = vitalStatus(latestVital?.temperature,        35.5, 37.5);
  const hrStatus     = vitalStatus(latestVital?.heart_rate,          50,  120);
  const spo2Status   = vitalStatus(latestVital?.oxygen_saturation,   94,  100);
  const bpStatus     = vitalStatus(latestVital?.systolic_bp,         90,  180);
  const glucStatus   = vitalStatus(latestVital?.blood_glucose,       70,  140);

  const isCritical = [tempStatus, hrStatus, spo2Status, bpStatus].includes('critical');
  const hasVitals  = latestVital != null;

  return (
    <div
      className={isCritical ? 'patient-card-critical' : 'patient-card'}
      onClick={() => navigate(`/patient/${patient.id}`)}
    >
      {/* ── Top row ── */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground text-sm truncate">{patient.full_name}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {[patient.ward && `Ward ${patient.ward}`, patient.bed_number && `Bed ${patient.bed_number}`]
              .filter(Boolean).join(' · ') || 'No location'}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          {isCritical ? (
            <div className="relative flex items-center">
              <span className="absolute inline-flex h-3 w-3 rounded-full bg-destructive opacity-70 animate-pulse-ring" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
            </div>
          ) : hasVitals ? (
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-success animate-blink" />
          ) : (
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
          )}
          {isCritical && (
            <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">
              Critical
            </span>
          )}
        </div>
      </div>

      {/* ── ECG ── */}
      <div className="mb-3 rounded-lg bg-muted/30 px-2 py-1.5 border border-border/50">
        <ECGLine heartRate={latestVital?.heart_rate} isCritical={isCritical} width={260} height={38} />
      </div>

      {/* ── Vitals grid ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className={chipClass(tempStatus)}>
          <div className="flex items-center gap-1">
            <Thermometer className={`h-3 w-3 ${valueColor(tempStatus)}`} />
            <span className="text-[10px] text-muted-foreground font-medium">TEMP</span>
          </div>
          <span className={`font-mono text-sm font-bold leading-tight ${valueColor(tempStatus)}`}>
            {latestVital?.temperature != null ? `${latestVital.temperature}°` : '—'}
          </span>
        </div>

        <div className={chipClass(hrStatus)}>
          <div className="flex items-center gap-1">
            <Heart className={`h-3 w-3 ${valueColor(hrStatus)}`} />
            <span className="text-[10px] text-muted-foreground font-medium">HR</span>
          </div>
          <span className={`font-mono text-sm font-bold leading-tight ${valueColor(hrStatus)}`}>
            {latestVital?.heart_rate != null ? `${latestVital.heart_rate}` : '—'}
          </span>
        </div>

        <div className={chipClass(spo2Status)}>
          <div className="flex items-center gap-1">
            <Gauge className={`h-3 w-3 ${valueColor(spo2Status)}`} />
            <span className="text-[10px] text-muted-foreground font-medium">SpO₂</span>
          </div>
          <span className={`font-mono text-sm font-bold leading-tight ${valueColor(spo2Status)}`}>
            {latestVital?.oxygen_saturation != null ? `${latestVital.oxygen_saturation}%` : '—'}
          </span>
        </div>

        <div className={chipClass(bpStatus)}>
          <div className="flex items-center gap-1">
            <Activity className={`h-3 w-3 ${valueColor(bpStatus)}`} />
            <span className="text-[10px] text-muted-foreground font-medium">BP</span>
          </div>
          <span className={`font-mono text-sm font-bold leading-tight ${valueColor(bpStatus)}`}>
            {latestVital?.systolic_bp != null ? `${latestVital.systolic_bp}/${latestVital.diastolic_bp}` : '—'}
          </span>
        </div>

        <div className={chipClass(glucStatus)}>
          <div className="flex items-center gap-1">
            <Droplets className={`h-3 w-3 ${valueColor(glucStatus)}`} />
            <span className="text-[10px] text-muted-foreground font-medium">GLUC</span>
          </div>
          <span className={`font-mono text-sm font-bold leading-tight ${valueColor(glucStatus)}`}>
            {latestVital?.blood_glucose != null ? `${latestVital.blood_glucose}` : '—'}
          </span>
        </div>
      </div>

      {/* ── Last updated ── */}
      {latestVital?.recorded_at && (
        <p className="text-[10px] text-muted-foreground/60 mt-2 text-right font-mono">
          {new Date(latestVital.recorded_at).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
