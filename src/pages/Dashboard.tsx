import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/AppHeader';
import { PatientCard } from '@/components/PatientCard';
import { CriticalAlert } from '@/components/CriticalAlert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, UserPlus, Users, AlertTriangle, CheckCircle2, BedDouble,
  Activity, Clock, Bell
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { format } from 'date-fns';

type ActivityItem = {
  id: string;
  acknowledged_at: string;
  patient_name: string;
  acknowledged_by_name: string;
  cause: string;
};

function getAlertCause(vital: {
  temperature?: number | null;
  heart_rate?: number | null;
  oxygen_saturation?: number | null;
  systolic_bp?: number | null;
}): string {
  const causes: string[] = [];
  if (vital.temperature != null && (vital.temperature < 35.5 || vital.temperature > 37.5))
    causes.push(`Temp ${vital.temperature}°C`);
  if (vital.heart_rate != null && (vital.heart_rate < 50 || vital.heart_rate > 120))
    causes.push(`HR ${vital.heart_rate} bpm`);
  if (vital.oxygen_saturation != null && vital.oxygen_saturation < 94)
    causes.push(`SpO₂ ${vital.oxygen_saturation}%`);
  if (vital.systolic_bp != null && (vital.systolic_bp < 90 || vital.systolic_bp > 180))
    causes.push(`BP ${vital.systolic_bp} mmHg`);
  return causes.length > 0 ? causes.join(' · ') : 'Critical vitals detected';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [patients, setPatients] = useState<Tables<'patients'>[]>([]);
  const [vitalsMap, setVitalsMap] = useState<Record<string, Tables<'vitals'>>>({});
  const [search, setSearch] = useState('');
  const [criticalAlert, setCriticalAlert] = useState<{ vital: Tables<'vitals'>; patientName: string } | null>(null);
  const [acknowledgedVitals, setAcknowledgedVitals] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'patients' | 'activity'>('patients');
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);

  const isNurse = role === 'nurse';
  const canViewActivity = role === 'admin' || role === 'doctor';

  const fetchPatients = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('patients')
      .select('*')
      .eq('is_active', true)
      .order('full_name');
    if (data) setPatients(data);
  }, [user]);

  const fetchLatestVitals = useCallback(async (patientIds: string[]) => {
    if (patientIds.length === 0) return;
    const results = await Promise.all(
      patientIds.map(async (pid) => {
        const { data } = await supabase
          .from('vitals')
          .select('*')
          .eq('patient_id', pid)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        return { pid, data };
      })
    );
    const map: Record<string, Tables<'vitals'>> = {};
    results.forEach(({ pid, data }) => { if (data) map[pid] = data; });
    setVitalsMap(map);
  }, []);

  const fetchActivity = useCallback(async () => {
    if (!canViewActivity) return;
    const { data } = await supabase
      .from('alert_acknowledgments')
      .select('id, acknowledged_at, patient_id, acknowledged_by, vital_id')
      .order('acknowledged_at', { ascending: false })
      .limit(30);

    if (!data) return;

    const patientIds = [...new Set(data.map((r) => r.patient_id))];
    const userIds = [...new Set(data.map((r) => r.acknowledged_by))];
    const vitalIds = [...new Set(data.map((r) => r.vital_id))];

    const [patientsRes, profilesRes, vitalsRes] = await Promise.all([
      supabase.from('patients').select('id, full_name').in('id', patientIds),
      supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
      supabase.from('vitals').select('id, temperature, heart_rate, oxygen_saturation, systolic_bp').in('id', vitalIds),
    ]);

    const patientMap: Record<string, string> = {};
    patientsRes.data?.forEach((p) => { patientMap[p.id] = p.full_name; });
    const profileMap: Record<string, string> = {};
    profilesRes.data?.forEach((p) => { profileMap[p.user_id] = p.full_name; });
    const vitalMap: Record<string, { temperature?: number | null; heart_rate?: number | null; oxygen_saturation?: number | null; systolic_bp?: number | null }> = {};
    vitalsRes.data?.forEach((v) => { vitalMap[v.id] = v; });

    setActivityFeed(
      data.map((r) => ({
        id: r.id,
        acknowledged_at: r.acknowledged_at,
        patient_name: patientMap[r.patient_id] ?? 'Unknown Patient',
        acknowledged_by_name: profileMap[r.acknowledged_by] ?? 'Unknown User',
        cause: getAlertCause(vitalMap[r.vital_id] ?? {}),
      }))
    );
  }, [canViewActivity]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);
  useEffect(() => { if (patients.length > 0) fetchLatestVitals(patients.map((p) => p.id)); }, [patients, fetchLatestVitals]);
  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  // Real-time vitals subscription
  useEffect(() => {
    const channel = supabase
      .channel('vitals-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vitals' }, (payload) => {
        const v = payload.new as Tables<'vitals'>;
        setVitalsMap((prev) => ({ ...prev, [v.patient_id]: v }));
        if (v.is_critical && !acknowledgedVitals.has(v.id)) {
          const patient = patients.find((p) => p.id === v.patient_id);
          if (patient) setCriticalAlert({ vital: v, patientName: patient.full_name });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [patients, acknowledgedVitals]);

  // Real-time alert acknowledgments
  useEffect(() => {
    if (!canViewActivity) return;
    const channel = supabase
      .channel('ack-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alert_acknowledgments' }, () => {
        fetchActivity();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [canViewActivity, fetchActivity]);

  const filteredPatients = patients.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.ward?.toLowerCase().includes(search.toLowerCase()) ||
    p.id_number?.toLowerCase().includes(search.toLowerCase())
  );

  const criticalCount = patients.filter((p) => {
    const v = vitalsMap[p.id];
    if (!v) return false;
    return (
      (v.temperature != null && (v.temperature < 35.5 || v.temperature > 37.5)) ||
      (v.heart_rate != null && (v.heart_rate < 50 || v.heart_rate > 120)) ||
      (v.oxygen_saturation != null && v.oxygen_saturation < 94) ||
      (v.systolic_bp != null && (v.systolic_bp < 90 || v.systolic_bp > 180))
    );
  }).length;
  const stableCount = patients.length - criticalCount;

  const handleAcknowledge = () => {
    if (criticalAlert) {
      setAcknowledgedVitals((prev) => new Set(prev).add(criticalAlert.vital.id));
      setCriticalAlert(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="p-6 max-w-screen-2xl mx-auto space-y-6">

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-slide-up">
          <div className="stat-card">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground font-mono">{patients.length}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Active Patients</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-destructive/10 border border-destructive/20 shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-destructive font-mono">{criticalCount}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Critical</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-success/10 border border-success/20 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-success font-mono">{stableCount}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Stable</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent border border-border shrink-0">
              <BedDouble className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground font-mono">
                {patients.filter((p) => vitalsMap[p.id]).length}
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Monitored</p>
            </div>
          </div>
        </div>

        {/* ── Tabs (doctors/admins only) ── */}
        {canViewActivity && (
          <div className="flex gap-1 border-b border-border">
            <button
              onClick={() => setActiveTab('patients')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'patients'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="h-3.5 w-3.5" /> Patient Monitor
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'activity'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Activity className="h-3.5 w-3.5" /> Activity Feed
            </button>
          </div>
        )}

        {/* ── Patient Monitor tab ── */}
        {activeTab === 'patients' && (
          <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">All Patients</h2>
                <p className="text-xs text-muted-foreground">
                  {filteredPatients.length} of {patients.length} patients shown · real-time updates active
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search name, ward, ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 w-full sm:w-56 h-9 text-sm bg-muted border-border"
                  />
                </div>
                <Button size="sm" onClick={() => navigate('/patient/new')} className="shrink-0 h-9">
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Add Patient
                </Button>
              </div>
            </div>

            {filteredPatients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center animate-slide-up">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-foreground font-medium">No patients found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search ? 'Try a different search term' : 'Register the first patient to start monitoring'}
                </p>
                {!search && (
                  <Button className="mt-4" onClick={() => navigate('/patient/new')}>
                    <UserPlus className="h-4 w-4 mr-2" /> Register Patient
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 animate-slide-up">
                {filteredPatients.map((patient) => (
                  <PatientCard
                    key={patient.id}
                    patient={patient}
                    latestVital={vitalsMap[patient.id] ?? null}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Activity Feed tab ── */}
        {activeTab === 'activity' && canViewActivity && (
          <div className="space-y-3 animate-slide-up">
            <div>
              <h2 className="text-base font-semibold text-foreground">Alert Activity</h2>
              <p className="text-xs text-muted-foreground">Real-time log of critical alerts and acknowledgments</p>
            </div>
            {activityFeed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Bell className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No alert acknowledgments yet</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="divide-y divide-border">
                  {activityFeed.map((item) => (
                    <div key={item.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-success/10 border border-success/20 shrink-0 mt-0.5">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">
                          <span className="font-medium">{item.acknowledged_by_name}</span>
                          {' '}acknowledged alert for{' '}
                          <span className="font-medium">{item.patient_name}</span>
                        </p>
                        <p className="text-xs text-destructive/80 font-medium mt-0.5">{item.cause}</p>
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(new Date(item.acknowledged_at), 'dd MMM yyyy · HH:mm:ss')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
