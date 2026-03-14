import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function PatientForm() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

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
    if (!isNew && id) {
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
      });
    }
  }, [id, isNew]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const payload = {
      full_name: form.full_name,
      date_of_birth: form.date_of_birth,
      gender: form.gender,
      id_number: form.id_number || null,
      ward: form.ward || null,
      bed_number: form.bed_number || null,
      diagnosis: form.diagnosis || null,
      notes: form.notes || null,
    };

    if (isNew) {
      const { error } = await supabase.from('patients').insert(payload);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Patient added');
        navigate('/');
      }
    } else {
      const { error } = await supabase.from('patients').update(payload).eq('id', id!);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Patient updated');
        navigate(`/patient/${id}`);
      }
    }

    setSubmitting(false);
  };

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="p-6 max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-bold text-foreground mb-6">
            {isNew ? 'Add New Patient' : 'Edit Patient'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Full Name *</Label>
                <Input value={form.full_name} onChange={(e) => update('full_name', e.target.value)} required />
              </div>
              <div>
                <Label>Date of Birth *</Label>
                <Input type="date" value={form.date_of_birth} onChange={(e) => update('date_of_birth', e.target.value)} required />
              </div>
              <div>
                <Label>Gender *</Label>
                <Select value={form.gender} onValueChange={(v) => update('gender', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ID Number</Label>
                <Input value={form.id_number} onChange={(e) => update('id_number', e.target.value)} />
              </div>
              <div>
                <Label>Ward</Label>
                <Input value={form.ward} onChange={(e) => update('ward', e.target.value)} />
              </div>
              <div>
                <Label>Bed Number</Label>
                <Input value={form.bed_number} onChange={(e) => update('bed_number', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Diagnosis</Label>
                <Textarea value={form.diagnosis} onChange={(e) => update('diagnosis', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : isNew ? 'Add Patient' : 'Save Changes'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
