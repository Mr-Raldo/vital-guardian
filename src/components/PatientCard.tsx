import { useNavigate } from 'react-router-dom';
import { ECGLine } from './ECGLine';
import { Thermometer, Heart, Activity, Droplets } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

interface PatientCardProps {
  patient: Tables<'patients'>;
  latestVital?: Tables<'vitals'> | null;
}

export function PatientCard({ patient, latestVital }: PatientCardProps) {
  const navigate = useNavigate();
  const isCritical = latestVital?.temperature != null && latestVital.temperature > 37;
  const cardClass = isCritical ? 'patient-card-critical' : 'patient-card';

  return (
    <div
      className={`${cardClass} cursor-pointer`}
      onClick={() => navigate(`/patient/${patient.id}`)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-foreground text-base">{patient.full_name}</h3>
          <p className="text-xs text-muted-foreground">
            {patient.ward && `Ward ${patient.ward}`}
            {patient.bed_number && ` · Bed ${patient.bed_number}`}
          </p>
        </div>
        {isCritical && (
          <span className="px-2 py-0.5 bg-destructive text-destructive-foreground text-xs font-semibold rounded">
            CRITICAL
          </span>
        )}
      </div>

      <div className="mb-3">
        <ECGLine
          heartRate={latestVital?.heart_rate}
          isCritical={isCritical}
          width={280}
          height={36}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5">
          <Thermometer className={`h-3.5 w-3.5 ${isCritical ? 'text-destructive' : 'text-muted-foreground'}`} />
          <span className={`font-mono text-sm font-semibold ${isCritical ? 'text-destructive' : 'text-foreground'}`}>
            {latestVital?.temperature != null ? `${latestVital.temperature}°C` : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-sm font-semibold text-foreground">
            {latestVital?.heart_rate != null ? `${latestVital.heart_rate} bpm` : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-sm font-semibold text-foreground">
            {latestVital?.systolic_bp != null ? `${latestVital.systolic_bp}/${latestVital.diastolic_bp}` : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Droplets className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-sm font-semibold text-foreground">
            {latestVital?.blood_glucose != null ? `${latestVital.blood_glucose} mg/dL` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
