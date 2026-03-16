import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, Activity, Wifi, ShieldCheck } from 'lucide-react';

const ROLE_STYLES: Record<string, string> = {
  admin:  'bg-purple-100 text-purple-700 border-purple-200',
  doctor: 'bg-blue-100 text-blue-700 border-blue-200',
  nurse:  'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const ROLE_LABELS: Record<string, string> = {
  admin:  'Admin',
  doctor: 'Doctor',
  nurse:  'Nurse',
};

export function AppHeader() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
  const dateStr = time.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  const roleKey = role ?? 'nurse';
  const roleStyle = ROLE_STYLES[roleKey] ?? ROLE_STYLES.nurse;
  const roleLabel = ROLE_LABELS[roleKey] ?? roleKey;

  return (
    <header className="border-b border-border bg-white/90 backdrop-blur-sm px-6 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
      {/* Left — brand */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/20">
          <Activity className="h-5 w-5 text-primary" />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-success border-2 border-card animate-blink" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-foreground leading-tight">
            Intelligent Multi Parameter Patient Monitoring System
          </h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">IMPMS · Clinical Dashboard</p>
        </div>
      </div>

      {/* Centre — live clock */}
      <div className="hidden md:flex flex-col items-center">
        <span className="font-mono text-xl font-bold text-primary tracking-widest">{timeStr}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{dateStr}</span>
      </div>

      {/* Right — user info */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-success">
          <Wifi className="h-3.5 w-3.5" />
          <span className="font-medium uppercase tracking-wide">Live</span>
        </div>
        <div className="hidden sm:block text-right">
          <p className="text-xs font-medium text-foreground">{user?.email}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{roleLabel}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide border ${roleStyle}`}>
          {roleLabel}
        </span>
        {role === 'admin' && (
          <Button
            variant={location.pathname === '/admin' ? 'default' : 'outline'}
            size="sm"
            onClick={() => navigate('/admin')}
            className="hidden sm:flex items-center gap-1.5 h-8"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
