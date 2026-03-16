import { useEffect, useCallback } from 'react';
import { AlertTriangle, Thermometer, Heart, Activity, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';

interface CriticalAlertProps {
  vital: Tables<'vitals'>;
  patientName: string;
  onAcknowledge: () => void;
}

export function CriticalAlert({ vital, patientName, onAcknowledge }: CriticalAlertProps) {
  const { user } = useAuth();

  useEffect(() => {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    const interval = setInterval(() => {
      oscillator.frequency.setValueAtTime(
        oscillator.frequency.value === 880 ? 660 : 880,
        ctx.currentTime
      );
    }, 500);
    return () => { clearInterval(interval); oscillator.stop(); ctx.close(); };
  }, []);

  const handleAcknowledge = useCallback(async () => {
    if (!user) return;
    await supabase.from('alert_acknowledgments').insert({
      vital_id: vital.id,
      patient_id: vital.patient_id,
      acknowledged_by: user.id,
      user_agent: navigator.userAgent,
    });
    onAcknowledge();
  }, [user, vital, onAcknowledge]);

  return (
    <div className="critical-overlay" role="alertdialog">
      <div className="critical-card animate-slide-up">
        {/* Header */}
        <div className="critical-header">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10">
              <span className="absolute w-10 h-10 rounded-full bg-white/20 animate-pulse-ring" />
              <AlertTriangle className="h-6 w-6 text-white relative z-10" />
            </div>
            <div>
              <p className="text-[10px] text-white/70 uppercase tracking-widest font-medium">Critical Alert</p>
              <h2 className="text-xl font-bold text-white leading-tight">Immediate Attention Required</h2>
            </div>
            <div className="ml-auto flex flex-col items-end">
              <span className="text-[10px] text-white/60 font-mono">
                {new Date(vital.recorded_at).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Patient */}
          <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
              <span className="text-destructive font-bold text-sm">
                {patientName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Patient</p>
              <p className="font-semibold text-foreground">{patientName}</p>
            </div>
          </div>

          {/* Vitals grid */}
          <div className="grid grid-cols-2 gap-2">
            {vital.temperature != null && (
              <div className={`rounded-xl p-3 border ${vital.temperature > 37 ? 'bg-destructive/10 border-destructive/30' : 'bg-muted border-border'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Thermometer className={`h-3.5 w-3.5 ${vital.temperature > 37 ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Temperature</span>
                </div>
                <p className={`font-mono text-2xl font-bold ${vital.temperature > 37 ? 'text-destructive' : 'text-foreground'}`}>
                  {vital.temperature}°C
                </p>
              </div>
            )}
            {vital.heart_rate != null && (
              <div className="rounded-xl p-3 border bg-muted border-border">
                <div className="flex items-center gap-1.5 mb-1">
                  <Heart className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Heart Rate</span>
                </div>
                <p className="font-mono text-2xl font-bold text-foreground">{vital.heart_rate} <span className="text-sm font-normal text-muted-foreground">bpm</span></p>
              </div>
            )}
            {vital.systolic_bp != null && (
              <div className="rounded-xl p-3 border bg-muted border-border">
                <div className="flex items-center gap-1.5 mb-1">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Blood Pressure</span>
                </div>
                <p className="font-mono text-2xl font-bold text-foreground">{vital.systolic_bp}/{vital.diastolic_bp}</p>
              </div>
            )}
            {vital.oxygen_saturation != null && (
              <div className={`rounded-xl p-3 border ${vital.oxygen_saturation < 94 ? 'bg-destructive/10 border-destructive/30' : 'bg-muted border-border'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Gauge className={`h-3.5 w-3.5 ${vital.oxygen_saturation < 94 ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">SpO₂</span>
                </div>
                <p className={`font-mono text-2xl font-bold ${vital.oxygen_saturation < 94 ? 'text-destructive' : 'text-foreground'}`}>
                  {vital.oxygen_saturation}%
                </p>
              </div>
            )}
          </div>

          {/* Acknowledge */}
          <Button
            onClick={handleAcknowledge}
            size="lg"
            className="w-full bg-destructive text-white hover:bg-destructive/90 font-bold tracking-wide py-6"
          >
            ACKNOWLEDGE ALERT
          </Button>

          <p className="text-[11px] text-center text-muted-foreground">
            Acknowledgment is logged with your identity and timestamp for clinical audit.
          </p>
        </div>
      </div>
    </div>
  );
}
