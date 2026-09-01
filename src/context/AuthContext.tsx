import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { toast } from 'sonner';
import { getBaseUrl } from '@/lib/config';
import { validateGuestToken } from '@/lib/guestApi';

type AuthUser = {
  name?: string;
  id?: string;
  username?: string;
  department?: string;
  designation?: string;
  notification_permissions?: boolean;
  module_access?: string[];
};

/** A read-only shared-link session. Only takes effect when there is no real
 *  logged-in user — a logged-in user always sees the full app. */
type GuestSession = { token: string; scope: string };

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  expiresAt: number | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isTokenValid: () => boolean;
  validateToken: () => Promise<boolean>;
  /** Active guest session, or null. Ignored while a real user is logged in. */
  guest: GuestSession | null;
  /** True while a share token is being validated against the backend. */
  guestChecking: boolean;
  /** Validate a share token against the backend and, if good, start guest mode. */
  activateGuest: (token: string, scope: string) => Promise<boolean>;
  clearGuest: () => void;
};

const KEY = 'fc_auth_v1';
const GUEST_KEY = 'fc_guest_v1';

// Hardcoded admin bypass — no API call, full module access
const SBR_ADMIN_TOKEN = '__sbr_admin_bypass__';
const SBR_ADMIN_USER: AuthUser = {
  id: 'sbr-admin',
  name: 'SBR Admin',
  username: 'sbr@admin',
  department: 'Administration',
  designation: 'Super Admin',
  notification_permissions: true,
  module_access: [
    'indents-request', 'admin-ops-indents', 'fuel-requests-admin', 'on-demand-task', 'on-demand-task-legacy',
    'admin-request', 'admin-mrf-approvals', 'admin-inbox',
    'leads', 'farmers', 'land-acquisition', 'farm-directory', 'lease-master', 'land-hierarchy', 'tasks-beta',
    'user-management',
    'inventory', 'inventory-approvals', 'inventory-indents', 'fuels-consumables', 'inventory-inbox',
    'finance-admin-ops', 'purchase-req', 'vendor-directory', 'ho-module',
    'purchase-flow', 'work-order', 'wo-creation', 'work-verifier', 'work-approver', 'work-flow', 'scope-of-work', 'wcc-module', 'purchase-inbox',
    'hr-management', 'hrms', 'staff-onboarding', 'man-power-req', 'hrms-inbox',
    'vehicle-management', 'fleet-chart', 'logistics-request',
    'cultivation-calendar', 'cultivation-master', 'cultivation-plan',
    'field-monitoring', 'field-visit-analytics', 'labour-management',
    'harvest-planning', 'harvest-orders', 'harvest-cards',
    'weighment', 'rental-rate-card', 'service-requests',
    'director-fuel', 'director-inbox',
    'accounts-dashboard', 'accounts-ledger', 'accounts-purchase', 'accounts-payments',
  ],
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // Start "checking" if a share token is already in the URL, so guarded pages can
  // show a spinner instead of flashing their locked state before validation runs.
  const [guestChecking, setGuestChecking] = useState(() => {
    try {
      return !!new URLSearchParams(window.location.search).get('guest');
    } catch {
      return false;
    }
  });
  const [guest, setGuest] = useState<GuestSession | null>(() => {
    try {
      const raw = localStorage.getItem(GUEST_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed.token === 'string' && typeof parsed.scope === 'string'
        ? { token: parsed.token, scope: parsed.scope }
        : null;
    } catch {
      return null;
    }
  });

  const clearGuest = useCallback(() => {
    setGuest(null);
    try {
      localStorage.removeItem(GUEST_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const activateGuest = useCallback(async (guestToken: string, scope: string) => {
    setGuestChecking(true);
    try {
      const ok = await validateGuestToken(guestToken, scope);
      if (!ok) {
        clearGuest();
        return false;
      }
      const next = { token: guestToken, scope };
      setGuest(next);
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return true;
    } finally {
      setGuestChecking(false);
    }
  }, [clearGuest]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const nextUser = parsed.user ?? null;
        const nextToken = parsed.token ?? null;
        const nextExpiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : null;

        if (nextToken && nextExpiresAt && Date.now() >= nextExpiresAt) {
          localStorage.removeItem(KEY);
          setUser(null);
          setToken(null);
          setExpiresAt(null);
        } else {
          setUser(nextUser);
          setToken(nextToken);
          setExpiresAt(nextExpiresAt);
        }
      }
    } catch (err) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const endOfTodayMs = () => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  };

  const jwtExpMs = (t: string) => {
    // Best-effort decode JWT exp claim (seconds) -> ms.
    // If token isn't a JWT, return null.
    try {
      const parts = t.split('.');
      if (parts.length < 2) return null;
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
      const json = atob(padded);
      const payload = JSON.parse(json);
      const expSec = payload?.exp;
      if (typeof expSec === 'number' && Number.isFinite(expSec)) return expSec * 1000;
      return null;
    } catch {
      return null;
    }
  };

  const computeExpiresAt = (t: string) => {
    const endToday = endOfTodayMs();
    const jwtExp = jwtExpMs(t);
    if (jwtExp && jwtExp > 0) return Math.min(endToday, jwtExp);
    return endToday;
  };

  const persist = (u: AuthUser | null, t: string | null, exp: number | null) => {
    setUser(u);
    setToken(t);
    setExpiresAt(exp);
    try {
      if (u && t) localStorage.setItem(KEY, JSON.stringify({ user: u, token: t, expiresAt: exp }));
      else localStorage.removeItem(KEY);
    } catch (err) {
      // ignore
    }
  };

  const isTokenValid = useCallback(() => {
    if (!token) return false;
    const exp = expiresAt;
    if (!exp) return true;
    return Date.now() < exp;
  }, [token, expiresAt]);

  const fetchCredentials = async (t: string) => {
    const BASE_URL = getBaseUrl().replace(/\/$/, '');
    const res = await fetch(`${BASE_URL}/login/get_credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: t }),
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    const detail = (data && (data.detail || data.message)) ?? '';
    const expired = String(detail).toLowerCase().includes('token has expired');

    if (!res.ok) {
      if (expired) return { expired: true as const, user: null as AuthUser | null };
      throw new Error(detail || `Token validation failed (HTTP ${res.status})`);
    }

    if (expired) return { expired: true as const, user: null as AuthUser | null };

    const nextUser: AuthUser = {
      id: data?.staff_id ?? data?.staffId ?? '',
      name: data?.staff_name ?? data?.staffName ?? '',
      department: data?.staff_department ?? data?.staffDepartment ?? '',
      designation: data?.staff_designation ?? data?.staffDesignation ?? '',
      notification_permissions: data?.notification_permissions === true,
      module_access: Array.isArray(data?.module_access) ? data.module_access : [],
    };

    return { expired: false as const, user: nextUser };
  };

  const validateToken = useCallback(async () => {
    if (!token) return false;

    if (token === SBR_ADMIN_TOKEN) return true;

    // Fast local check first (end-of-day/JWT exp if available)
    if (!isTokenValid()) {
      persist(null, null, null);
      return false;
    }

    const { expired, user: nextUser } = await fetchCredentials(token);
    if (expired) {
      persist(null, null, null);
      return false;
    }

    // Keep token cached for the rest of the day, but don't extend beyond JWT exp if present
    const nextExp = computeExpiresAt(token);
    persist(nextUser, token, nextExp);
    return true;
  }, [token, isTokenValid]);

  const login = async (username: string, password: string) => {
    if (username === 'sbr@admin' && password === 'sbr@admin') {
      // Far-future expiry so the session never auto-expires
      persist(SBR_ADMIN_USER, SBR_ADMIN_TOKEN, new Date('2099-12-31T23:59:59').getTime());
      return;
    }

    const BASE_URL = getBaseUrl().replace(/\/$/, '');
    const res = await fetch(`${BASE_URL}/login/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!res.ok) {
      const detail = (data && (data.detail || data.message)) || `Login failed (HTTP ${res.status})`;
      throw new Error(detail);
    }

    if (!data?.success || !data?.token) {
      throw new Error('Invalid login response');
    }

    const t = String(data.token);
    const exp = computeExpiresAt(t);

    // cache token immediately; user details are optional
    persist(null, t, exp);

    try {
      const creds = await fetchCredentials(t);
      if (creds.expired) {
        persist(null, null, null);
        throw new Error('Token has expired');
      }
      persist(creds.user, t, exp);
    } catch {
      // keep token cached even if user info fetch fails
    }
  };

  const logout = () => {
    persist(null, null, null);
  };

  // A real login always wins over any lingering guest session.
  useEffect(() => {
    if (token && guest) clearGuest();
  }, [token, guest, clearGuest]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        expiresAt,
        loading,
        login,
        logout,
        isTokenValid,
        validateToken,
        guest: token ? null : guest,
        guestChecking,
        activateGuest,
        clearGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
