import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Users, UserPlus, ShieldCheck, Stethoscope, HeartPulse, ArrowLeft, Loader2, Eye, EyeOff, Trash2 } from 'lucide-react';
import type { Enums } from '@/integrations/supabase/types';

type AppRole = Enums<'app_role'>;

type UserRow = {
  user_id: string;
  full_name: string;
  created_at: string;
  role: AppRole;
};

const ROLE_STYLES: Record<AppRole, string> = {
  admin:  'bg-purple-100 text-purple-700 border-purple-200',
  doctor: 'bg-blue-100 text-blue-700 border-blue-200',
  nurse:  'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Create account form
  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createFullName, setCreateFullName] = useState('');
  const [createRole, setCreateRole] = useState<AppRole>('nurse');
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, created_at')
      .order('created_at', { ascending: false });

    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role');

    if (!profiles) { setLoadingUsers(false); return; }

    const roleMap: Record<string, AppRole> = {};
    roles?.forEach((r) => { roleMap[r.user_id] = r.role; });

    setUsers(
      profiles.map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        created_at: p.created_at,
        role: roleMap[p.user_id] ?? 'nurse',
      }))
    );
    setLoadingUsers(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleRoleChange = async (targetUserId: string, newRole: AppRole) => {
    setUpdatingRole(targetUserId);
    const { error } = await supabase
      .from('user_roles')
      .upsert({ user_id: targetUserId, role: newRole }, { onConflict: 'user_id' });

    if (error) {
      toast.error('Failed to update role');
    } else {
      toast.success('Role updated');
      setUsers((prev) =>
        prev.map((u) => u.user_id === targetUserId ? { ...u, role: newRole } : u)
      );
    }
    setUpdatingRole(null);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: createEmail,
          password: createPassword,
          fullName: createFullName,
          role: createRole,
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error ?? error?.message ?? 'Failed to create account');
      } else {
        toast.success(`Account created for ${createFullName}`);
        setCreateEmail('');
        setCreatePassword('');
        setCreateFullName('');
        setCreateRole('nurse');
        setShowCreate(false);
        fetchUsers();
      }
    } catch {
      toast.error('Failed to create account');
    }

    setCreating(false);
  };

  const handleDeleteUser = async (targetUserId: string) => {
    setDeletingUserId(targetUserId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: targetUserId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error || data?.error) {
        toast.error(data?.error ?? error?.message ?? 'Failed to delete user');
      } else {
        toast.success('User deleted');
        setUsers((prev) => prev.filter((u) => u.user_id !== targetUserId));
      }
    } catch {
      toast.error('Failed to delete user');
    }
    setDeletingUserId(null);
    setConfirmDeleteUserId(null);
  };

  const roleCounts = users.reduce(
    (acc, u) => { acc[u.role] = (acc[u.role] ?? 0) + 1; return acc; },
    {} as Record<AppRole, number>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Dashboard
            </Button>
            <div>
              <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-purple-600" /> Admin Panel
              </h1>
              <p className="text-xs text-muted-foreground">Manage staff accounts and roles</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <UserPlus className="h-4 w-4 mr-1.5" />
            Create Account
          </Button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-card">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-100 border border-purple-200 shrink-0">
              <ShieldCheck className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground font-mono">{roleCounts.admin ?? 0}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Admins</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 border border-blue-200 shrink-0">
              <Stethoscope className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground font-mono">{roleCounts.doctor ?? 0}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Doctors</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-100 border border-emerald-200 shrink-0">
              <HeartPulse className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground font-mono">{roleCounts.nurse ?? 0}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Nurses</p>
            </div>
          </div>
        </div>

        {/* ── Create Account Form ── */}
        {showCreate && (
          <div className="bg-card border border-border rounded-xl p-5 animate-slide-up">
            <h2 className="text-sm font-semibold text-foreground mb-4">Create Staff Account</h2>
            <form onSubmit={handleCreateAccount} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  placeholder="Dr. Jane Smith"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="jane@hospital.org"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Temporary Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="Min 6 characters"
                    required
                    minLength={6}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={createRole} onValueChange={(v) => setCreateRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nurse">Nurse</SelectItem>
                    <SelectItem value="doctor">Doctor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" disabled={creating} size="sm">
                  {creating && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Create Account
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ── User Table ── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Staff Accounts ({users.length})</h2>
          </div>

          {loadingUsers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {users.map((u) => (
                <div key={u.user_id} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                      {u.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        {u.full_name}
                        {u.user_id === user?.id && (
                          <span className="text-[10px] text-muted-foreground font-normal">(you)</span>
                        )}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wide ${ROLE_STYLES[u.role]}`}>
                        {u.role}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {updatingRole === u.user_id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Select
                        value={u.role}
                        onValueChange={(v) => handleRoleChange(u.user_id, v as AppRole)}
                        disabled={u.user_id === user?.id}
                      >
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nurse">Nurse</SelectItem>
                          <SelectItem value="doctor">Doctor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {u.user_id !== user?.id && (
                      confirmDeleteUserId === u.user_id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs px-2"
                            disabled={deletingUserId === u.user_id}
                            onClick={() => handleDeleteUser(u.user_id)}
                          >
                            {deletingUserId === u.user_id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : 'Confirm'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs px-2"
                            onClick={() => setConfirmDeleteUserId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDeleteUserId(u.user_id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
