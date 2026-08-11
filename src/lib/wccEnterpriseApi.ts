/* eslint-disable @typescript-eslint/no-explicit-any -- Purchase-flow endpoints return several legacy, non-versioned JSON shapes that are normalized below. */
import getBaseUrl from '@/lib/config';
import { buildLegacyAnnexure, calculateWccTotals, serviceLineFromOrder, type WccEnterpriseDraft, type WccServiceLine } from './wccEnterprise';

const BASE_URL = getBaseUrl().replace(/\/$/, '');
const DRAFT_KEY = 'sbr_wcc_enterprise_drafts_v2';

export interface WccOrderReference {
  flowId: string;
  comparisonId: string;
  prNumber: string;
  orderNumber: string;
  orderType: string;
  vendorId: string;
  vendorName: string;
  department: string;
  timestamp: string;
}

const safe = (value: unknown) => String(value ?? '').trim();

const fetchJson = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || data?.message || `Request failed (${response.status})`);
  return data;
};

export const listWccOrderReferences = async (signal?: AbortSignal): Promise<WccOrderReference[]> => {
  const url = `${BASE_URL}/purchase_flow/get_purchase_flows`;
  let response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal });
  if (response.status === 405) response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' }, signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || 'Failed to load eligible orders');
  const flows = Array.isArray(data?.purchase_flows) ? data.purchase_flows : [];
  const rows = await Promise.all(flows.map(async (flow: any) => {
    const comparisonId = safe(flow.comparison_id);
    let info: any = null;
    if (comparisonId) {
      try { info = await fetchJson(`${BASE_URL}/purchase_flow/get_left_panel_info/${encodeURIComponent(comparisonId)}`, { method: 'POST', headers: { Accept: 'application/json' }, signal }); }
      catch { try { info = await fetchJson(`${BASE_URL}/purchase_flow/get_left_panel_info`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pr_number: safe(flow.pr_number) || comparisonId }), signal }); } catch { info = null; } }
    }
    return { flowId: safe(flow.flow_id) || comparisonId, comparisonId, prNumber: safe(flow.pr_number) || safe(info?.pr_number), orderNumber: safe(flow.order_number) || safe(info?.Order_number), orderType: safe(flow.order_type) || safe(info?.indent_type), vendorId: safe(info?.approved_vendor_id) || safe(info?.vendor_details?.approved_vendor_id) || safe(info?.vendor_details?.vendor_id), vendorName: safe(info?.vendor_details?.vendor_name), department: safe(info?.department), timestamp: safe(flow.timestamp) } satisfies WccOrderReference;
  }));
  return rows.filter((row) => row.orderNumber).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
};

const collectLineArrays = (value: unknown, depth = 0): Record<string, unknown>[] => {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) {
    if (value.length && value.every((item) => item && typeof item === 'object' && !Array.isArray(item))) return value as Record<string, unknown>[];
    return value.flatMap((item) => collectLineArrays(item, depth + 1));
  }
  if (typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const priority = ['service_lines', 'item_row', 'items', 'line_items', 'table_rows', 'work_details', 'rows'];
  for (const key of priority) {
    const candidate = record[key];
    if (Array.isArray(candidate) && candidate.length) return candidate as Record<string, unknown>[];
  }
  for (const child of Object.values(record)) {
    const found = collectLineArrays(child, depth + 1);
    if (found.length) return found;
  }
  return [];
};

export const loadOrderServiceLines = async (order: WccOrderReference, signal?: AbortSignal): Promise<{ lines: WccServiceLine[]; orderValue: number; raw: unknown }> => {
  let data: any = null;
  if (order.prNumber) {
    try { data = await fetchJson(`${BASE_URL}/purchase_flow/get_purchase_orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pr_number: order.prNumber }), signal }); }
    catch { data = null; }
  }
  const orderList = Array.isArray(data?.purchase_orders) ? data.purchase_orders : Array.isArray(data?.orders) ? data.orders : [];
  const matching = orderList.find((item: any) => safe(item?.order_number) === order.orderNumber) || orderList.at(-1) || data;
  const rawLines = collectLineArrays(matching);
  const lines = rawLines.map(serviceLineFromOrder);
  const orderValue = lines.reduce((sum, line) => sum + line.orderedQty * line.rate, 0);
  return { lines, orderValue, raw: matching };
};

export const uploadWccEvidence = async (orderNumber: string, file: File) => {
  const body = new FormData();
  body.append('document', file);
  const data = await fetchJson(`${BASE_URL}/purchase_flow/upload_purchase_flow_document?order_number=${encodeURIComponent(orderNumber)}`, { method: 'POST', body });
  return safe(data?.file_url) || safe(data?.document_url);
};

const readDraftMap = (): Record<string, WccEnterpriseDraft> => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; }
};

export const listLocalWccDrafts = () => Object.values(readDraftMap()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
export const getLocalWccDraft = (draftId: string) => readDraftMap()[draftId] || null;
export const saveLocalWccDraft = (draft: WccEnterpriseDraft) => {
  const map = readDraftMap();
  const next = { ...draft, updatedAt: new Date().toISOString() };
  map[draft.draftId] = next;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(map));
  return next;
};
export const deleteLocalWccDraft = (draftId: string) => { const map = readDraftMap(); delete map[draftId]; localStorage.setItem(DRAFT_KEY, JSON.stringify(map)); };

export const submitEnterpriseWcc = async (draft: WccEnterpriseDraft) => {
  const annexure = buildLegacyAnnexure(draft);
  const totals = draft.serviceLines.filter((line) => line.selected).reduce((sum, line) => sum + line.currentQty, 0);
  const commercial = calculateWccTotals(draft);
  const response = await fetchJson(`${BASE_URL}/admin_wcc_certificate/create_certificate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_number: draft.header.referenceNumber,
      vendor_id: draft.header.vendorId,
      vendor_name: draft.header.vendorName,
      block_id: draft.landIds.join(', '),
      block_name: draft.header.projectSiteLabel || draft.header.site,
      scope_of_work: draft.serviceLines.filter((line) => line.selected).map((line) => line.description).join(', '),
      from_date: draft.header.statementFrom,
      to_date: draft.header.statementTo,
      annexure,
      rate_per_acre: totals > 0 ? commercial.gross / totals : 0,
      total_quantity: totals,
      total_certified_value: commercial.gross,
      prepared_by: { staff_id: draft.header.preparedById, name: draft.header.preparedByName, designation: '' },
      enterprise_payload: draft,
    }),
  });
  deleteLocalWccDraft(draft.draftId);
  return response;
};
