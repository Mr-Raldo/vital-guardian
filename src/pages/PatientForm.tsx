import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Pencil } from 'lucide-react';
import { toast } from 'sonner';

export default function PatientForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!id) return;
    supabase.from('patients').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        setForm({
          full_name: data.full_name,
          date_of_birth: data.date_of_birth,
          gender: data.gender,
          id_number: data.id_number ?? '',
          ward: data.ward ?? '',
          bed_number: data.bed_number ?? '',
          diagnosis: data.diagnosis ?? '',
          notes: data.notes ?? '',
        });
      }
      setLoading(false);
    });
  }, [id]);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // Check bed is not already occupied by a different active patient
    if (form.bed_number) {
      let bedQuery = supabase
        .from('patients')
        .select('id, full_name')
        .eq('is_active', true)
        .eq('bed_number', form.bed_number)
        .neq('id', id!); // exclude current patient
      if (form.ward) bedQuery = bedQuery.eq('ward', form.ward);
      const { data: occupied } = await bedQuery.maybeSingle();
      if (occupied) {
        toast.error(`Bed ${form.bed_number}${form.ward ? ` in ${form.ward}` : ''} is already occupied by ${occupied.full_name}`);
        setSubmitting(false);
        return;
      }
    }

    const { error } = await supabase.from('patients').update({
      full_name: form.full_name,
      date_of_birth: form.date_of_birth,
      gender: form.gender,
      id_number: form.id_number || null,
      ward: form.ward || null,
      bed_number: form.bed_number || null,
      diagnosis: form.diagnosis || null,
      notes: form.notes || null,
    }).eq('id', id!);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Patient updated');
      navigate(`/patient/${id}`);
    }

    setSubmitting(false);
  };

  if (loading) {
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
      <main className="p-6 max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate(`/patient/${id}`)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Patient
        </Button>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-muted border-b border-border px-6 py-5 flex items-center gap-3">
            <div className="bg-muted-foreground/10 rounded-full p-2">
              <Pencil className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Edit Patient</h2>
              <p className="text-sm text-muted-foreground">Update patient information below</p>
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
                    value={form.ward}
                    onChange={(e) => update('ward', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="bed_number">Bed Number</Label>
                  <Input
                    id="bed_number"
                    value={form.bed_number}
                    onChange={(e) => update('bed_number', e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="diagnosis">Diagnosis</Label>
                  <Textarea
                    id="diagnosis"
                    value={form.diagnosis}
                    onChange={(e) => update('diagnosis', e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
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
                {submitting ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(`/patient/${id}`)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
