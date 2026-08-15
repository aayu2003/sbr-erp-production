import getBaseUrl from '@/lib/config';

export type ApiOrderCommunication = {
  comparision_id?: unknown;
  pr_number?: unknown;
  TC_status?: unknown;
  NFA_status?: unknown;
  approved_vendor_id?: unknown;
  indent_type?: unknown;
  order_number?: unknown;
  order_status?: unknown;
};

// GET with POST fallback, matching the get_order_communication call pattern
// already used by HOInbox.tsx's list-loading effect.
export const fetchOrderCommunication = async (signal?: AbortSignal): Promise<ApiOrderCommunication[]> => {
  const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
  if (!baseUrl) return [];

  const url = `${baseUrl}/purchase_flow/get_order_communication`;
  const doFetch = (method: 'GET' | 'POST') =>
    fetch(url, { method, headers: { Accept: 'application/json' }, signal });

  let res = await doFetch('GET');
  if (res.status === 405) res = await doFetch('POST');
  if (!res.ok) return [];

  const data: unknown = await res.json().catch(() => null);
  return Array.isArray((data as any)?.order_communication) ? (data as any).order_communication : [];
};
