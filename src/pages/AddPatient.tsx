import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

type NurseOption = { user_id: string; full_name: string };

export default function AddPatient() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [nurses, setNurses] = useState<NurseOption[]>([]);
  const [assignedNurseId, setAssignedNurseId] = useState<string>('');

  const isNurse = role === 'nurse';

  const [form, setForm] = useState({
    full_name: '',
    date_of_birth: '',
    gender: 'male' as string,
    id_number: '',
    ward: '',
    bed_number: '',
    diagnosis: '',
    notes: '',
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Doctors and admins need to pick a nurse — fetch all nurses
  useEffect(() => {
    if (isNurse) return;
    const fetchNurses = async () => {
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'nurse');

      if (!roleRows?.length) return;

      const nurseIds = roleRows.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', nurseIds)
        .order('full_name');

      if (profiles) setNurses(profiles);
    };
    fetchNurses();
  }, [isNurse]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Doctors/admins must select a nurse before submitting
    if (!isNurse && !assignedNurseId) {
      toast.error('Please select an assigned nurse');
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from('patients').insert({
      full_name: form.full_name,
      date_of_birth: form.date_of_birth,
      gender: form.gender,
      id_number: form.id_number || null,
      ward: form.ward || null,
      bed_number: form.bed_number || null,
      diagnosis: form.diagnosis || null,
      notes: form.notes || null,
      // Nurse: auto-assigned to themselves. Doctor/Admin: selected nurse.
      assigned_nurse_id: isNurse ? (user?.id ?? null) : assignedNurseId,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Patient registered successfully');
      navigate('/');
    }

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="p-6 max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-primary/10 border-b border-border px-6 py-5 flex items-center gap-3">
            <div className="bg-primary/20 rounded-full p-2">
              <UserPlus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Register New Patient</h2>
              <p className="text-sm text-muted-foreground">Fill in all required fields to admit a new patient</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">

            {/* Personal Information */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Personal Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="full_name">Full Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="full_name"
                    placeholder="e.g. John Doe"
                    value={form.full_name}
                    onChange={(e) => update('full_name', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="dob">Date of Birth <span className="text-destructive">*</span></Label>
                  <Input
                    id="dob"
                    type="date"
                    value={form.date_of_birth}
                    onChange={(e) => update('date_of_birth', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="gender">Gender <span className="text-destructive">*</span></Label>
                  <Select value={form.gender} onValueChange={(v) => update('gender', v)}>
                    <SelectTrigger id="gender"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="id_number">National ID / Passport Number</Label>
                  <Input
                    id="id_number"
                    placeholder="Optional"
                    value={form.id_number}
                    onChange={(e) => update('id_number', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Admission Details */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Admission Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ward">Ward</Label>
                  <Input
                    id="ward"
                    placeholder="e.g. Ward A"
                    value={form.ward}
                    onChange={(e) => update('ward', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="bed_number">Bed Number</Label>
                  <Input
                    id="bed_number"
                    placeholder="e.g. B-12"
                    value={form.bed_number}
                    onChange={(e) => update('bed_number', e.target.value)}
                  />
                </div>

                {/* Nurse assignment — only for doctors and admins */}
                {!isNurse && (
                  <div className="sm:col-span-2">
                    <Label htmlFor="assigned_nurse">
                      Assign Nurse <span className="text-destructive">*</span>
                    </Label>
                    <Select value={assignedNurseId} onValueChange={setAssignedNurseId}>
                      <SelectTrigger id="assigned_nurse">
                        <SelectValue placeholder={nurses.length ? 'Select a nurse...' : 'No nurses registered yet'} />
                      </SelectTrigger>
                      <SelectContent>
                        {nurses.map((n) => (
                          <SelectItem key={n.user_id} value={n.user_id}>
                            {n.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {nurses.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Create nurse accounts in the Admin panel first.
                      </p>
                    )}
                  </div>
                )}

                <div className="sm:col-span-2">
                  <Label htmlFor="diagnosis">Diagnosis</Label>
                  <Textarea
                    id="diagnosis"
                    placeholder="Primary diagnosis or reason for admission"
                    value={form.diagnosis}
                    onChange={(e) => update('diagnosis', e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional clinical notes"
                    value={form.notes}
                    onChange={(e) => update('notes', e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t border-border">
              <Button type="submit" disabled={submitting} className="flex-1 sm:flex-none">
                <UserPlus className="h-4 w-4 mr-2" />
                {submitting ? 'Registering...' : 'Register Patient'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/')}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
