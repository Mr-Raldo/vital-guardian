import { useEffect, useRef, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    // Create alarm sound using Web Audio API
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();

    // Pulsing alarm pattern
    const interval = setInterval(() => {
      oscillator.frequency.setValueAtTime(
        oscillator.frequency.value === 880 ? 660 : 880,
        ctx.currentTime
      );
    }, 500);

    return () => {
      clearInterval(interval);
      oscillator.stop();
      ctx.close();
    };
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
    <div className="critical-overlay" role="alertdialog" aria-label="Critical patient alert">
      <div className="critical-card animate-fade-in">
        <div className="critical-header flex items-center gap-3">
          <div className="relative">
            <AlertTriangle className="h-8 w-8 text-destructive-foreground" />
            <div className="absolute inset-0 animate-pulse-ring rounded-full bg-destructive-foreground/30" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-destructive-foreground">CRITICAL ALERT</h2>
            <p className="text-sm text-destructive-foreground/90">Immediate attention required</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Patient</p>
            <p className="text-lg font-semibold text-foreground">{patientName}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {vital.temperature && vital.temperature > 37 && (
              <div className="bg-destructive/10 rounded-md p-3">
                <p className="text-xs text-muted-foreground">Temperature</p>
                <p className="vital-value-critical">{vital.temperature}°C</p>
              </div>
            )}
            {vital.heart_rate && (
              <div className="bg-muted rounded-md p-3">
                <p className="text-xs text-muted-foreground">Heart Rate</p>
                <p className="font-mono text-lg font-bold text-foreground">{vital.heart_rate} bpm</p>
              </div>
            )}
            {vital.systolic_bp && vital.diastolic_bp && (
              <div className="bg-muted rounded-md p-3">
                <p className="text-xs text-muted-foreground">Blood Pressure</p>
                <p className="font-mono text-lg font-bold text-foreground">{vital.systolic_bp}/{vital.diastolic_bp}</p>
              </div>
            )}
            {vital.oxygen_saturation && (
              <div className="bg-muted rounded-md p-3">
                <p className="text-xs text-muted-foreground">SpO₂</p>
                <p className="font-mono text-lg font-bold text-foreground">{vital.oxygen_saturation}%</p>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Alert triggered: {new Date(vital.recorded_at).toLocaleString()}
          </div>

          <Button
            onClick={handleAcknowledge}
            size="lg"
            className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 text-lg py-6 font-semibold"
          >
            I ACKNOWLEDGE THIS ALERT
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            This acknowledgment will be logged with your identity and timestamp for audit purposes.
          </p>
        </div>
      </div>
    </div>
  );
}
