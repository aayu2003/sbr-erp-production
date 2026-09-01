import getBaseUrl from '@/lib/config';

/**
 * Guest-link API. A guest link is an unguessable UUID minted by a logged-in user
 * that unlocks exactly one read-only surface (a "scope") for an unauthenticated
 * visitor. The backend (`/guest/*`) validates the token on every data call.
 */

export const GUEST_SCOPE_PROCUREMENT = 'procurement-dashboard';

/** scope -> the single route path a guest link for that scope may open. */
export const GUEST_SCOPE_PATHS: Record<string, string> = {
  [GUEST_SCOPE_PROCUREMENT]: '/procurement-dashboard',
};

export const isGuestPathAllowed = (scope: string | undefined, pathname: string): boolean => {
  const allowed = scope ? GUEST_SCOPE_PATHS[scope] : undefined;
  if (!allowed) return false;
  return pathname === allowed || pathname.startsWith(`${allowed}/`);
};

export const guestShareUrl = (token: string): string =>
  `${window.location.origin}/procurement-dashboard?guest=${encodeURIComponent(token)}`;

const base = () => String(getBaseUrl() ?? '').replace(/\/$/, '');

export type GuestLink = {
  token: string;
  scope: string;
  label?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  revoked?: boolean;
  revoked_at?: string | null;
};

export const validateGuestToken = async (
  token: string,
  scope: string,
  signal?: AbortSignal,
): Promise<boolean> => {
  if (!token) return false;
  try {
    const res = await fetch(
      `${base()}/guest/validate?token=${encodeURIComponent(token)}&scope=${encodeURIComponent(scope)}`,
      { headers: { Accept: 'application/json' }, signal },
    );
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { valid?: boolean } | null;
    return data?.valid === true;
  } catch {
    return false;
  }
};

export type GuestProcurementPayload = {
  order_communication: unknown[];
  order_progress: unknown[];
  vendors: unknown[];
};

export const fetchGuestProcurementDashboard = async (
  token: string,
  signal?: AbortSignal,
): Promise<GuestProcurementPayload> => {
  const res = await fetch(
    `${base()}/guest/procurement_dashboard?token=${encodeURIComponent(token)}`,
    { headers: { Accept: 'application/json' }, signal },
  );
  if (res.status === 401 || res.status === 403) {
    throw new Error('This shared link is no longer valid.');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as GuestProcurementPayload | null;
  return {
    order_communication: Array.isArray(data?.order_communication) ? data!.order_communication : [],
    order_progress: Array.isArray(data?.order_progress) ? data!.order_progress : [],
    vendors: Array.isArray(data?.vendors) ? data!.vendors : [],
  };
};

export const createGuestLink = async (
  scope: string,
  label?: string,
  createdBy?: string,
): Promise<{ token: string; scope: string }> => {
  const res = await fetch(`${base()}/guest/create_link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ scope, label: label || null, created_by: createdBy || null }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Could not create link (HTTP ${res.status})`);
  }
  return res.json();
};

export const listGuestLinks = async (scope?: string): Promise<GuestLink[]> => {
  const url = scope
    ? `${base()}/guest/list_links?scope=${encodeURIComponent(scope)}`
    : `${base()}/guest/list_links`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as { links?: GuestLink[] } | null;
  return Array.isArray(data?.links) ? data!.links : [];
};

export const revokeGuestLink = async (token: string): Promise<void> => {
  const res = await fetch(`${base()}/guest/revoke_link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `Could not revoke link (HTTP ${res.status})`);
  }
};
