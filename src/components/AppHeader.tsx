import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Activity } from 'lucide-react';

export function AppHeader() {
  const { user, role, signOut } = useAuth();

  return (
    <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-bold text-foreground">VitalPulse</h1>
        </div>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-medium uppercase">
          {role ?? 'user'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{user?.email}</span>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
