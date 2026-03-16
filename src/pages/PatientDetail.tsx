import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppHeader } from '@/components/AppHeader';
import { ECGLine } from '@/components/ECGLine';
import { CriticalAlert } from '@/components/CriticalAlert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Thermometer, Heart, Activity, Droplets, Wind, Gauge, Pencil, Trash2, Loader2 } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { format } from 'date-fns';

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const canPrescribe = role === 'doctor' || role === 'admin';
  const isAdmin = role === 'admin';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingPatient, setDeletingPatient] = useState(false);
  const [patient, setPatient] = useState<Tables<'patients'> | null>(null);
  const [vitals, setVitals] = useState<Tables<'vitals'>[]>([]);
  const [treatments, setTreatments] = useState<Tables<'treatments'>[]>([]);
  const [nurseName, setNurseName] = useState<string | null>(null);
  const [showAddTreatment, setShowAddTreatment] = useState(false);
  const [treatmentName, setTreatmentName] = useState('');
  const [treatmentDesc, setTreatmentDesc] = useState('');
  const [criticalAlert, setCriticalAlert] = useState<{ vital: Tables<'vitals'>; patientName: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;

    const [patientRes, vitalsRes, treatmentsRes] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('vitals').select('*').eq('patient_id', id).order('recorded_at', { ascending: false }).limit(20),
      supabase.from('treatments').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
    ]);

    if (patientRes.data) {
      setPatient(patientRes.data);
      if (patientRes.data.assigned_nurse_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', patientRes.data.assigned_nurse_id)
          .maybeSingle();
        setNurseName(profile?.full_name ?? null);
      }
    }
    if (vitalsRes.data) setVitals(vitalsRes.data);
    if (treatmentsRes.data) setTreatments(treatmentsRes.data);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time vitals
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`vitals-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vitals', filter: `patient_id=eq.${id}` },
        (payload) => {
          const v = payload.new as Tables<'vitals'>;
          setVitals((prev) => [v, ...prev].slice(0, 20));
          if (v.temperature != null && v.temperature > 37 && patient) {
            setCriticalAlert({ vital: v, patientName: patient.full_name });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, patient]);

  const latestVital = vitals[0] ?? null;
  const isCritical = latestVital?.temperature != null && latestVital.temperature > 37;

  const handleDeletePatient = async () => {
    if (!id) return;
    setDeletingPatient(true);
    const { error } = await supabase.from('patients').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete patient');
      setDeletingPatient(false);
    } else {
      toast.success('Patient deleted');
      navigate('/');
    }
  };

  const handleAddTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user) return;
    const { error } = await supabase.from('treatments').insert({
      patient_id: id,
      treatment_name: treatmentName,
      description: treatmentDesc || null,
      prescribed_by: user.id,
    });
    if (error) {
      toast.error('Failed to add treatment');
    } else {
      toast.success('Treatment added');
      setTreatmentName('');
      setTreatmentDesc('');
      setShowAddTreatment(false);
      fetchData();
    }
  };

  if (!patient) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading patient...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/patient/${id}/edit`)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit Patient
            </Button>
            {isAdmin && (
              confirmDelete ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deletingPatient}
                    onClick={handleDeletePatient}
                  >
                    {deletingPatient ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Confirm Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Patient
                </Button>
              )
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Patient Info + Vitals */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-card border border-border rounded-lg p-5">
              <h2 className="text-xl font-bold text-foreground mb-1">{patient.full_name}</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">DOB</span>
                  <span className="text-foreground">{format(new Date(patient.date_of_birth), 'dd MMM yyyy')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gender</span>
                  <span className="text-foreground capitalize">{patient.gender}</span>
                </div>
                {patient.id_number && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ID</span>
                    <span className="text-foreground font-mono">{patient.id_number}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ward / Bed</span>
                  <span className="text-foreground">{patient.ward ?? '—'} / {patient.bed_number ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admitted</span>
                  <span className="text-foreground">{format(new Date(patient.admission_date), 'dd MMM yyyy')}</span>
                </div>
                {nurseName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assigned Nurse</span>
                    <span className="text-foreground">{nurseName}</span>
                  </div>
                )}
                {patient.diagnosis && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-muted-foreground">Diagnosis</span>
                    <p className="text-foreground mt-1">{patient.diagnosis}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Current Vitals */}
            <div className={`rounded-lg p-5 ${isCritical ? 'bg-card border-2 border-destructive' : 'bg-card border border-border'}`}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">LIVE VITALS</h3>
              <div className="mb-3">
                <ECGLine heartRate={latestVital?.heart_rate} isCritical={isCritical} width={260} height={40} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <VitalItem icon={Thermometer} label="Temp" value={latestVital?.temperature != null ? `${latestVital.temperature}°C` : '—'} critical={isCritical} />
                <VitalItem icon={Heart} label="HR" value={latestVital?.heart_rate != null ? `${latestVital.heart_rate} bpm` : '—'} />
                <VitalItem icon={Activity} label="BP" value={latestVital?.systolic_bp != null ? `${latestVital.systolic_bp}/${latestVital.diastolic_bp}` : '—'} />
                <VitalItem icon={Gauge} label="SpO₂" value={latestVital?.oxygen_saturation != null ? `${latestVital.oxygen_saturation}%` : '—'} />
                <VitalItem icon={Droplets} label="Glucose" value={latestVital?.blood_glucose != null ? `${latestVital.blood_glucose}` : '—'} />
                <VitalItem icon={Wind} label="Resp" value={latestVital?.respiratory_rate != null ? `${latestVital.respiratory_rate}/min` : '—'} />
              </div>
            </div>
          </div>

          {/* Right: Timeline */}
          <div className="lg:col-span-2 space-y-4">
            {/* Treatments */}
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground">TREATMENTS</h3>
                {canPrescribe && (
                  <Button size="sm" variant="outline" onClick={() => setShowAddTreatment(!showAddTreatment)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                )}
              </div>

              {showAddTreatment && (
                <form onSubmit={handleAddTreatment} className="mb-4 p-4 bg-muted rounded-md space-y-3">
                  <div>
                    <Label>Treatment Name</Label>
                    <Input value={treatmentName} onChange={(e) => setTreatmentName(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea value={treatmentDesc} onChange={(e) => setTreatmentDesc(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">Save</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddTreatment(false)}>Cancel</Button>
                  </div>
                </form>
              )}

              {treatments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No treatments recorded.</p>
              ) : (
                <div className="space-y-3">
                  {treatments.map((t) => (
                    <div key={t.id} className="border-l-2 border-primary pl-4 py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">{t.treatment_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${t.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                          {t.status}
                        </span>
                      </div>
                      {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{format(new Date(t.start_date), 'dd MMM yyyy HH:mm')}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vitals History */}
            <div className="bg-card border border-border rounded-lg p-5">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4">VITALS HISTORY</h3>
              {vitals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No vitals recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-muted-foreground font-medium">Time</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Temp</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">HR</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">BP</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">SpO₂</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Glucose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vitals.map((v) => (
                        <tr key={v.id} className={`border-b border-border/50 ${v.temperature != null && v.temperature > 37 ? 'bg-destructive/5' : ''}`}>
                          <td className="py-2 text-foreground">{format(new Date(v.recorded_at), 'HH:mm:ss')}</td>
                          <td className={`py-2 text-right font-mono ${v.temperature != null && v.temperature > 37 ? 'text-destructive font-semibold' : 'text-foreground'}`}>
                            {v.temperature ?? '—'}
                          </td>
                          <td className="py-2 text-right font-mono text-foreground">{v.heart_rate ?? '—'}</td>
                          <td className="py-2 text-right font-mono text-foreground">
                            {v.systolic_bp != null ? `${v.systolic_bp}/${v.diastolic_bp}` : '—'}
                          </td>
                          <td className="py-2 text-right font-mono text-foreground">{v.oxygen_saturation ?? '—'}</td>
                          <td className="py-2 text-right font-mono text-foreground">{v.blood_glucose ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {criticalAlert && (
        <CriticalAlert
          vital={criticalAlert.vital}
          patientName={criticalAlert.patientName}
          onAcknowledge={() => setCriticalAlert(null)}
        />
      )}
    </div>
  );
}

function VitalItem({ icon: Icon, label, value, critical }: { icon: any; label: string; value: string; critical?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${critical ? 'text-destructive' : 'text-muted-foreground'}`} />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-mono text-sm font-semibold ${critical ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
      </div>
    </div>
  );
}
