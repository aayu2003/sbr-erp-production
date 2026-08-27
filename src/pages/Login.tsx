import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  Eye,
  Headphones,
  Leaf,
  Lock,
  LogIn,
  Sprout,
  User,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import agriLogo from '@/Assets/3f-logo.png';
import loginBgVideo from '@/Assets/login-bg-video.mp4';

const featureItems = [
  { label: 'Farm\nManagement', icon: Leaf },
  { label: 'Business\nAnalytics', icon: BarChart3 },
  { label: 'Operations\nControl', icon: ClipboardList },
  { label: 'Workforce\nManagement', icon: Users },
];

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      toast.success('Logged in');
      navigate('/ceos-desk', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#eef4ee] font-['Plus_Jakarta_Sans'] text-[#102339]">
      <video
        src={loginBgVideo}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(245,250,247,0.5)_0%,rgba(255,255,255,0.08)_38%,rgba(247,238,217,0.08)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_2%_96%,rgba(4,44,25,0.34)_0,rgba(4,44,25,0.08)_24%,transparent_42%)]" />

      <section className="relative z-10 flex min-h-screen items-center justify-center px-5 py-5">
        <section className="relative w-full max-w-[540px] rounded-[28px] border border-white bg-white px-6 pb-3 pt-5 shadow-[0_20px_45px_rgba(42,51,38,0.24)] sm:px-12 md:px-14">
          <div className="pointer-events-none absolute left-6 top-5 h-16 w-32 bg-[radial-gradient(#8cc275_1px,transparent_1px)] [background-size:15px_15px] opacity-70" />
          <div className="pointer-events-none absolute right-0 top-0 h-28 w-44 rounded-tr-[28px] border-r border-t border-[#9bc77c] bg-[repeating-radial-gradient(ellipse_at_top_right,transparent_0_7px,rgba(116,184,62,0.28)_7px_8px)] opacity-70" />

          <form onSubmit={handleSubmit} className="relative z-10">
            <div className="flex flex-col items-center text-center">
              <img src={agriLogo} alt="3F Agri ERP" className="h-[82px] w-[82px] object-contain" />
              <div className="-mt-1 text-[34px] font-extrabold leading-none tracking-normal">
                <span className="text-[#238535]">Sai Bioresources</span> <span className="text-[#0e4e8f]">ERP</span>
              </div>
              <div className="mt-2.5 flex items-center gap-2.5 text-[11px] font-bold text-[#102339]">
                <span className="h-[2px] w-5 bg-[#218536]" />
                Manage Today.
                <Sprout className="h-3.5 w-3.5 fill-[#228b3c] text-[#228b3c]" />
                Grow Tomorrow.
                <span className="h-[2px] w-5 bg-[#218536]" />
              </div>

              <h2 className="mt-5 text-[25px] font-extrabold leading-tight tracking-normal text-[#142337]">Welcome Back!</h2>
              <p className="mt-1.5 text-[14px] font-medium text-[#566273]">Sign in to your SBR ERP account</p>
            </div>

            <div className="mt-5 space-y-3">
              <label className="relative block">
                <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1f8b38]" strokeWidth={2.1} />
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="h-[49px] rounded-lg border-[#d6dde5] bg-white pl-12 pr-4 text-[14px] font-medium shadow-sm placeholder:text-[#7b8795] focus-visible:ring-[#1f8b38]"
                  autoComplete="username"
                />
              </label>

              <label className="relative block">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1f8b38]" strokeWidth={2.1} />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="h-[49px] rounded-lg border-[#d6dde5] bg-white pl-12 pr-12 text-[14px] font-medium shadow-sm placeholder:text-[#7b8795] focus-visible:ring-[#1f8b38]"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#102339]"
                >
                  <Eye className="h-5 w-5" strokeWidth={2.2} />
                </button>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 text-[12px] font-semibold">
              <label className="flex items-center gap-2.5 text-[#687283]">
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-[#208438]" />
                Remember me
              </label>
              <button type="button" className="text-[#096e25] hover:text-[#0b551f]">
                Forgot Password?
              </button>
            </div>

            <Button
              className="mt-5 h-[49px] w-full rounded-lg bg-[linear-gradient(90deg,#208331,#46ad1d)] text-[16px] font-extrabold text-white shadow-[0_12px_20px_rgba(31,132,49,0.28)] hover:brightness-105"
              type="submit"
              disabled={submitting}
            >
              <span className="mr-4 flex h-7 w-7 items-center justify-center rounded-full bg-white/12">
                <LogIn className="h-4 w-4" />
              </span>
              {submitting ? 'Signing In...' : 'Sign In'}
            </Button>

          </form>

          <div className="-mx-6 mt-5 rounded-b-[26px] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(223,239,216,0.9)_100%)] px-6 pb-4 pt-5 sm:-mx-12 sm:px-12 md:-mx-14 md:px-14">
            <div className="flex items-center justify-center gap-2.5 text-center text-[12px] font-semibold text-[#5d6775]">
              <Headphones className="h-4 w-4 text-[#168138]" />
              Don&apos;t have an account?
              <button type="button" className="text-[#0b7428]">
                Contact Administrator
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
};

export default LoginPage;
