import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/AppHeader';
import { PatientCard } from '@/components/PatientCard';
import { CriticalAlert } from '@/components/CriticalAlert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, UserPlus } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Tables<'patients'>[]>([]);
  const [vitalsMap, setVitalsMap] = useState<Record<string, Tables<'vitals'>>>({});
  const [search, setSearch] = useState('');
  const [criticalAlert, setCriticalAlert] = useState<{ vital: Tables<'vitals'>; patientName: string } | null>(null);
  const [acknowledgedVitals, setAcknowledgedVitals] = useState<Set<string>>(new Set());

  const fetchPatients = useCallback(async () => {
    const { data } = await supabase
      .from('patients')
      .select('*')
      .eq('is_active', true)
      .order('full_name');
    if (data) setPatients(data);
  }, []);

  const fetchLatestVitals = useCallback(async (patientIds: string[]) => {
    if (patientIds.length === 0) return;
    // Get latest vital for each patient
    const promises = patientIds.map(async (pid) => {
      const { data } = await supabase
        .from('vitals')
        .select('*')
        .eq('patient_id', pid)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { pid, data };
    });
    const results = await Promise.all(promises);
    const map: Record<string, Tables<'vitals'>> = {};
    results.forEach(({ pid, data }) => {
      if (data) map[pid] = data;
    });
    setVitalsMap(map);
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  useEffect(() => {
    if (patients.length > 0) {
      fetchLatestVitals(patients.map((p) => p.id));
    }
  }, [patients, fetchLatestVitals]);

  // Real-time vitals subscription
  useEffect(() => {
    const channel = supabase
      .channel('vitals-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vitals' },
        (payload) => {
          const newVital = payload.new as Tables<'vitals'>;
          setVitalsMap((prev) => ({ ...prev, [newVital.patient_id]: newVital }));

          // Check for critical condition
          if (newVital.temperature != null && newVital.temperature > 37 && !acknowledgedVitals.has(newVital.id)) {
            const patient = patients.find((p) => p.id === newVital.patient_id);
            if (patient) {
              setCriticalAlert({ vital: newVital, patientName: patient.full_name });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [patients, acknowledgedVitals]);

  const filteredPatients = patients.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.ward?.toLowerCase().includes(search.toLowerCase()) ||
    p.id_number?.toLowerCase().includes(search.toLowerCase())
  );

  const handleAcknowledge = () => {
    if (criticalAlert) {
      setAcknowledgedVitals((prev) => new Set(prev).add(criticalAlert.vital.id));
      setCriticalAlert(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-foreground">Patient Monitor</h2>
            <p className="text-sm text-muted-foreground">{patients.length} active patients</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Button onClick={() => navigate('/patient/new')}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Patient
            </Button>
          </div>
        </div>

        {filteredPatients.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground">No patients found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPatients.map((patient) => (
              <PatientCard
                key={patient.id}
                patient={patient}
                latestVital={vitalsMap[patient.id] ?? null}
              />
            ))}
          </div>
        )}
      </main>

      {criticalAlert && (
        <CriticalAlert
          vital={criticalAlert.vital}
          patientName={criticalAlert.patientName}
          onAcknowledge={handleAcknowledge}
        />
      )}
    </div>
  );
}
