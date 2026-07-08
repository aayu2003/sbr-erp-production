import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, LogOut, Palette, Settings as SettingsIcon, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { ACCENT_PRESETS, useTheme } from '@/context/ThemeContext';

const SectionCard = ({ title, subtitle, Icon, children }: {
  title: string;
  subtitle: string;
  Icon: React.ElementType;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
      </div>
      <Icon className="h-5 w-5 text-[var(--brand-primary)]" />
    </div>
    <div className="mt-6">{children}</div>
  </section>
);

const NOTIFICATION_PREFS = [
  { key: 'email', label: 'Email alerts', description: 'Approvals, requisitions, and status changes' },
  { key: 'push', label: 'Push notifications', description: 'Real-time alerts while using the app' },
  { key: 'weekly', label: 'Weekly summary', description: 'A digest of activity across your modules' },
];

const Settings = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { accentId, setAccentId } = useTheme();
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    email: true,
    push: true,
    weekly: false,
  });

  const toggleNotifPref = (key: string) => {
    setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-[#fbfcfd] p-8 text-slate-900">
      <div>
        <p className="text-sm font-extrabold text-[var(--brand-primary)]">Preferences</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Settings</h1>
        <p className="mt-3 max-w-2xl text-base font-medium text-slate-600">
          Manage your profile, appearance, and notification preferences.
        </p>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <SectionCard title="Profile" subtitle="Your account details" Icon={User}>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-2xl font-extrabold text-white">
              {(user?.name ?? 'SBR User').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold text-slate-950">{user?.name || 'SBR User'}</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-500">{user?.designation || '—'}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{user?.department || '—'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { logout(); navigate('/login'); }}
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-rose-200 text-sm font-bold text-rose-600 transition hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </SectionCard>

        <SectionCard title="Notifications" subtitle="Choose what you want to be notified about" Icon={Bell}>
          <div className="space-y-3">
            {NOTIFICATION_PREFS.map(pref => (
              <div key={pref.key} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-800">{pref.label}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{pref.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifPrefs[pref.key]}
                  onClick={() => toggleNotifPref(pref.key)}
                  className={cn(
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                    notifPrefs[pref.key] ? 'bg-[var(--brand-primary)]' : 'bg-slate-200'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                      notifPrefs[pref.key] ? 'translate-x-[22px]' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Brand Theme" subtitle="Pick the accent color used across the app's navigation" Icon={Palette}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {ACCENT_PRESETS.map(preset => {
              const isActive = preset.id === accentId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setAccentId(preset.id)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border p-4 transition',
                    isActive ? 'border-[var(--brand-primary)] bg-slate-50 ring-1 ring-[var(--brand-primary)]' : 'border-slate-200 hover:bg-slate-50'
                  )}
                >
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                    style={{ backgroundColor: preset.primary }}
                  >
                    {isActive && <Check className="h-5 w-5 text-white" />}
                  </span>
                  <span className="text-xs font-extrabold text-slate-700">{preset.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Live Preview</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="flex h-10 items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 text-sm font-bold text-white shadow-sm">
                <SettingsIcon className="h-4 w-4" />
                Primary Button
              </div>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-[var(--brand-primary)] px-4 text-sm font-bold text-[var(--brand-primary)]">
                Outline Button
              </div>
              <span className="rounded-full bg-[var(--brand-primary)]/10 px-3 py-1.5 text-xs font-extrabold text-[var(--brand-primary)]">
                Badge
              </span>
            </div>
          </div>

          <p className="mt-4 text-xs font-semibold text-slate-400">
            This updates the navigation sidebar and this Settings page right away. Other modules will adopt this brand color in a future update.
          </p>
        </SectionCard>
      </div>
    </div>
  );
};

export default Settings;
