// Real backend client for Gate Entry + GRN — both live behind the same FastAPI router,
// admin_grn_inspection.py, per two different DynamoDB tables (purchase_gate_entery /
// admin_purchase_grn). This replaces the earlier localStorage mocks (gateEntryStore.ts,
// grnStore.ts).

import getBaseUrl from '@/lib/config';

const baseUrl = () => String(getBaseUrl() ?? '').replace(/\/$/, '');

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    throw new Error(data?.detail || `Request failed (HTTP ${res.status})`);
  }
  return data as T;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    throw new Error(data?.detail || `Request failed (HTTP ${res.status})`);
  }
  return data as T;
}

// ─────────────────────────────────────────────────────────────
// GATE ENTRY
// ─────────────────────────────────────────────────────────────

export type GateEntryType = 'Inward' | 'Outward';

export type GateEntryRecord = {
  enteryId: string;
  siteEntryNo?: string;
  entryDate: string;
  entryTime: string;
  gateNo: string;
  entryType: GateEntryType;
  vendorId: string;
  vendorName: string;
  vendorContactPerson?: string;
  vendorMobile?: string;
  vendorGstin?: string;
  destinationType?: 'Store' | 'Site';
  destinationId?: string;
  destinationName?: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  itemUnit?: string;
  itemQuantity?: number;
  outwardToType?: string;
  outwardToId?: string;
  outwardToName?: string;
  outwardContactPerson?: string;
  outwardMobile?: string;
  outwardPurpose?: string;
  orderNumber?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  challanNumber?: string;
  challanDate?: string;
  lrNumber?: string;
  lrDate?: string;
  ewayBillNumber?: string;
  usedInGrn?: string;
  createdAt: string;
};

export type GateEntryInput = {
  siteEntryNo?: string;
  entryDate: string;
  entryTime: string;
  gateNo: string;
  entryType: GateEntryType;
  vendorId: string;
  vendorName: string;
  vendorContactPerson?: string;
  vendorMobile?: string;
  vendorGstin?: string;
  destinationType?: 'Store' | 'Site';
  destinationId?: string;
  destinationName?: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  itemUnit?: string;
  itemQuantity?: number;
  outwardToType?: string;
  outwardToId?: string;
  outwardToName?: string;
  outwardContactPerson?: string;
  outwardMobile?: string;
  outwardPurpose?: string;
  orderNumber?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  challanNumber?: string;
  challanDate?: string;
  lrNumber?: string;
  lrDate?: string;
  ewayBillNumber?: string;
};

const toGateEntryRecord = (raw: Record<string, unknown>): GateEntryRecord => ({
  enteryId: String(raw.entery_id || ''),
  siteEntryNo: raw.site_entry_no ? String(raw.site_entry_no) : undefined,
  entryDate: String(raw.entry_date || ''),
  entryTime: String(raw.entry_time || ''),
  gateNo: String(raw.gate_no || ''),
  entryType: (raw.entry_type === 'Outward' ? 'Outward' : 'Inward'),
  vendorId: String(raw.vendor_id || ''),
  vendorName: String(raw.vendor_name || ''),
  vendorContactPerson: raw.vendor_contact_person ? String(raw.vendor_contact_person) : undefined,
  vendorMobile: raw.vendor_mobile ? String(raw.vendor_mobile) : undefined,
  vendorGstin: raw.vendor_gstin ? String(raw.vendor_gstin) : undefined,
  destinationType: raw.destination_type === 'Site' ? 'Site' : raw.destination_type === 'Store' ? 'Store' : undefined,
  destinationId: raw.destination_id ? String(raw.destination_id) : undefined,
  destinationName: raw.destination_name ? String(raw.destination_name) : undefined,
  itemId: raw.item_id ? String(raw.item_id) : undefined,
  itemCode: raw.item_code ? String(raw.item_code) : undefined,
  itemName: raw.item_name ? String(raw.item_name) : undefined,
  itemUnit: raw.item_unit ? String(raw.item_unit) : undefined,
  itemQuantity: raw.item_quantity != null && raw.item_quantity !== '' ? Number(raw.item_quantity) : undefined,
  outwardToType: raw.outward_to_type ? String(raw.outward_to_type) : undefined,
  outwardToId: raw.outward_to_id ? String(raw.outward_to_id) : undefined,
  outwardToName: raw.outward_to_name ? String(raw.outward_to_name) : undefined,
  outwardContactPerson: raw.outward_contact_person ? String(raw.outward_contact_person) : undefined,
  outwardMobile: raw.outward_mobile ? String(raw.outward_mobile) : undefined,
  outwardPurpose: raw.outward_purpose ? String(raw.outward_purpose) : undefined,
  orderNumber: raw.order_number ? String(raw.order_number) : undefined,
  invoiceNumber: raw.invoice_number ? String(raw.invoice_number) : undefined,
  invoiceDate: raw.invoice_date ? String(raw.invoice_date) : undefined,
  challanNumber: raw.challan_number ? String(raw.challan_number) : undefined,
  challanDate: raw.challan_date ? String(raw.challan_date) : undefined,
  lrNumber: raw.lr_number ? String(raw.lr_number) : undefined,
  lrDate: raw.lr_date ? String(raw.lr_date) : undefined,
  ewayBillNumber: raw.eway_bill_number ? String(raw.eway_bill_number) : undefined,
  usedInGrn: raw.used_in_grn ? String(raw.used_in_grn) : undefined,
  createdAt: String(raw.created_at || ''),
});

const gateEntryPayload = (input: GateEntryInput) => ({
    site_entry_no: input.siteEntryNo || '',
    entry_date: input.entryDate,
    entry_time: input.entryTime,
    gate_no: input.gateNo,
    entry_type: input.entryType,
    vendor_id: input.vendorId,
    vendor_name: input.vendorName,
    vendor_contact_person: input.vendorContactPerson || '',
    vendor_mobile: input.vendorMobile || '',
    vendor_gstin: input.vendorGstin || '',
    destination_type: input.destinationType || '',
    destination_id: input.destinationId || '',
    destination_name: input.destinationName || '',
    item_id: input.itemId || '',
    item_code: input.itemCode || '',
    item_name: input.itemName || '',
    item_unit: input.itemUnit || '',
    item_quantity: input.itemQuantity ?? '',
    outward_to_type: input.outwardToType || '',
    outward_to_id: input.outwardToId || '',
    outward_to_name: input.outwardToName || '',
    outward_contact_person: input.outwardContactPerson || '',
    outward_mobile: input.outwardMobile || '',
    outward_purpose: input.outwardPurpose || '',
    order_number: input.orderNumber || '',
    invoice_number: input.invoiceNumber || '',
    invoice_date: input.invoiceDate || '',
    challan_number: input.challanNumber || '',
    challan_date: input.challanDate || '',
    lr_number: input.lrNumber || '',
    lr_date: input.lrDate || '',
    eway_bill_number: input.ewayBillNumber || '',
});

export const createGateEntry = async (input: GateEntryInput): Promise<{ enteryId: string }> => {
  const data = await apiPost<{ entery_id: string }>('/admin_grn_inspection/create_gate_entry', gateEntryPayload(input));
  return { enteryId: data.entery_id };
};

export const updateGateEntry = async (entryId: string, input: GateEntryInput): Promise<void> => {
  const res = await fetch(`${baseUrl()}/admin_grn_inspection/update_gate_entry/${encodeURIComponent(entryId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(gateEntryPayload(input)),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Update endpoint unavailable (HTTP ${res.status})`);
  }
};

export const deleteGateEntry = async (entryId: string): Promise<void> => {
  const res = await fetch(`${baseUrl()}/admin_grn_inspection/delete_gate_entry/${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Delete endpoint unavailable (HTTP ${res.status})`);
  }
};

export const getGateEntries = async (): Promise<GateEntryRecord[]> => {
  const data = await apiGet<{ gate_entries: Record<string, unknown>[] }>('/admin_grn_inspection/get_gate_entries');
  return (data.gate_entries || []).map(toGateEntryRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const getAvailableGateEntries = async (orderNumber: string): Promise<GateEntryRecord[]> => {
  const data = await apiGet<{ gate_entries: Record<string, unknown>[] }>(
    `/admin_grn_inspection/get_available_gate_entries/${encodeURIComponent(orderNumber)}`,
  );
  return (data.gate_entries || []).map(toGateEntryRecord);
};

// ─────────────────────────────────────────────────────────────
// GRN
// ─────────────────────────────────────────────────────────────

export type GrnSigner = {
  staffId: string;
  name: string;
  designation?: string;
  timestamp: string;
};

export type GrnStatus = 'pending_verification' | 'pending_approval' | 'approved' | 'needs_revision';

export type GrnRejection = {
  stage: 'pending_verification' | 'pending_approval';
  by: GrnSigner;
  reason: string;
};

export type GrnLineItem = {
  itemId: string;
  itemCode?: string;
  description: string;
  uom: string;
  billedQty: number;
  receivedQty: number;
  rejectedQty: number;
  shortQty: number;
  unitPrice: number;
  basicValue: number;
  discPercent: number;
  freight: number;
  gstPercent: number;
  gstAmount: number;
  valueWithTax: number;
  pf: number;
  totalGrnValue: number;
  location?: string;
};

export type GRNRecord = {
  grnNo: string;
  grnDate: string;
  orderId: string; // = poNo, kept for compatibility with older call sites

  poNo: string;
  poDate?: string;
  prNo?: string;
  prDate?: string;
  prBy?: string;

  vendorId: string;
  vendorName: string;
  vendorAddress?: string;

  department?: string;
  group?: string;

  gateEntryIds: string[];
  invNo?: string;
  invDate?: string;
  challanNo?: string;
  challanDate?: string;
  lrNo?: string;
  lrDate?: string;
  geNo?: string;
  geDate?: string;

  items: GrnLineItem[];
  remarks?: string;

  status: GrnStatus;
  preparedBy?: GrnSigner;
  verifiedBy?: GrnSigner;
  approvedBy?: GrnSigner;
  rejection?: GrnRejection | null;
  revisionCount: number;
  createdAt: string;
};

export type GrnLineItemInput = GrnLineItem;

// The minimal PO/vendor metadata the GRN wizard needs, sourced from live purchase-flow data
// rather than any locally stored "incoming order" record.
export type GrnOrderInfo = {
  poNo: string;
  poDate?: string;
  prNo?: string;
  prDate?: string;
  prBy?: string;
  vendorId: string;
  vendorName: string;
  vendorAddress?: string;
  department?: string;
  group?: string;
};

export type CreateGrnInput = {
  orderNumber: string;
  poDate?: string;
  prNumber?: string;
  prDate?: string;
  prBy?: string;
  vendorId: string;
  vendorName: string;
  vendorAddress?: string;
  department?: string;
  group?: string;
  gateEntryIds: string[];
  items: GrnLineItemInput[];
  remarks?: string;
  preparedBy: GrnSigner;
};

export type ResubmitGrnInput = {
  grnNo: string;
  gateEntryIds: string[];
  items: GrnLineItemInput[];
  remarks?: string;
  preparedBy: GrnSigner;
  resendForApproval?: boolean;
};

const toSigner = (raw: unknown): GrnSigner | undefined => {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!s.staff_id && !s.name) return undefined;
  return {
    staffId: String(s.staff_id || ''),
    name: String(s.name || ''),
    designation: s.designation ? String(s.designation) : undefined,
    timestamp: String(s.timestamp || ''),
  };
};

const toLineItem = (raw: Record<string, unknown>): GrnLineItem => ({
  itemId: String(raw.item_id || ''),
  itemCode: raw.item_code ? String(raw.item_code) : undefined,
  description: String(raw.description || ''),
  uom: String(raw.uom || ''),
  billedQty: Number(raw.billed_qty) || 0,
  receivedQty: Number(raw.received_qty) || 0,
  rejectedQty: Number(raw.rejected_qty) || 0,
  shortQty: Number(raw.short_qty) || 0,
  unitPrice: Number(raw.unit_price) || 0,
  basicValue: Number(raw.basic_value) || 0,
  discPercent: Number(raw.disc_percent) || 0,
  freight: Number(raw.freight) || 0,
  gstPercent: Number(raw.gst_percent) || 0,
  gstAmount: Number(raw.gst_amount) || 0,
  valueWithTax: Number(raw.value_with_tax) || 0,
  pf: Number(raw.pf) || 0,
  totalGrnValue: Number(raw.total_grn_value) || 0,
  location: raw.location ? String(raw.location) : undefined,
});

const fromLineItem = (it: GrnLineItemInput) => ({
  item_id: it.itemId,
  item_code: it.itemCode || '',
  description: it.description,
  uom: it.uom,
  billed_qty: it.billedQty,
  received_qty: it.receivedQty,
  rejected_qty: it.rejectedQty,
  short_qty: it.shortQty,
  unit_price: it.unitPrice,
  basic_value: it.basicValue,
  disc_percent: it.discPercent,
  freight: it.freight,
  gst_percent: it.gstPercent,
  gst_amount: it.gstAmount,
  value_with_tax: it.valueWithTax,
  pf: it.pf,
  total_grn_value: it.totalGrnValue,
  location: it.location || '',
});

const toGrnRecord = (raw: Record<string, unknown>): GRNRecord => {
  const rejectionRaw = raw.rejection as Record<string, unknown> | null | undefined;
  const rejectionBy = rejectionRaw ? toSigner(rejectionRaw) : undefined;
  const poNo = String(raw.order_number || '');
  return {
    grnNo: String(raw.grn_number || ''),
    grnDate: String(raw.grn_date || ''),
    orderId: poNo,
    poNo,
    poDate: raw.po_date ? String(raw.po_date) : undefined,
    prNo: raw.pr_number ? String(raw.pr_number) : undefined,
    prDate: raw.pr_date ? String(raw.pr_date) : undefined,
    prBy: raw.pr_by ? String(raw.pr_by) : undefined,
    vendorId: String(raw.vendor_id || ''),
    vendorName: String(raw.vendor_name || ''),
    vendorAddress: raw.vendor_address ? String(raw.vendor_address) : undefined,
    department: raw.department ? String(raw.department) : undefined,
    group: raw.group ? String(raw.group) : undefined,
    gateEntryIds: Array.isArray(raw.gate_entry_ids) ? (raw.gate_entry_ids as string[]) : [],
    invNo: raw.invoice_no ? String(raw.invoice_no) : undefined,
    invDate: raw.invoice_date ? String(raw.invoice_date) : undefined,
    challanNo: raw.challan_no ? String(raw.challan_no) : undefined,
    challanDate: raw.challan_date ? String(raw.challan_date) : undefined,
    lrNo: raw.lr_no ? String(raw.lr_no) : undefined,
    lrDate: raw.lr_date ? String(raw.lr_date) : undefined,
    geNo: raw.ge_no ? String(raw.ge_no) : undefined,
    geDate: raw.ge_date ? String(raw.ge_date) : undefined,
    items: Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]).map(toLineItem) : [],
    remarks: raw.remarks ? String(raw.remarks) : undefined,
    status: (raw.status as GrnStatus) || 'pending_verification',
    preparedBy: toSigner(raw.prepared_by),
    verifiedBy: toSigner(raw.verified_by),
    approvedBy: toSigner(raw.approved_by),
    rejection: rejectionRaw && rejectionBy
      ? { stage: (rejectionRaw.stage as GrnRejection['stage']) || 'pending_verification', by: rejectionBy, reason: String(rejectionRaw.reason || '') }
      : null,
    revisionCount: Number(raw.revision_count) || 0,
    createdAt: String(raw.created_at || ''),
  };
};

const fromSigner = (s: GrnSigner) => ({ staff_id: s.staffId, name: s.name, designation: s.designation || '' });

export const createGrn = async (input: CreateGrnInput): Promise<GRNRecord> => {
  if (input.gateEntryIds.length === 0) {
    throw new Error('Link at least one inward gate entry before creating a GRN');
  }

  // Re-check the gate records immediately before submission. This prevents a GRN from
  // being raised against an outward movement, another PO, or an entry already consumed
  // by a different GRN even if the screen data became stale while the form was open.
  const currentGateEntries = await getGateEntries();
  const selectedGateEntries = input.gateEntryIds.map((entryId) => (
    currentGateEntries.find((entry) => entry.enteryId === entryId)
  ));
  if (selectedGateEntries.some((entry) => !entry)) {
    throw new Error('One or more selected gate entries no longer exist. Please select them again.');
  }
  if (selectedGateEntries.some((entry) => entry?.entryType !== 'Inward')) {
    throw new Error('GRN can only be created against inward gate entries');
  }
  if (selectedGateEntries.some((entry) => entry?.orderNumber !== input.orderNumber)) {
    throw new Error('Every selected gate entry must belong to the selected purchase order');
  }
  if (selectedGateEntries.some((entry) => Boolean(entry?.usedInGrn))) {
    throw new Error('One or more selected gate entries are already linked to another GRN');
  }

  const data = await apiPost<{ grn: Record<string, unknown> } | { grn_number: string }>('/admin_grn_inspection/create_grn', {
    order_number: input.orderNumber,
    po_date: input.poDate || '',
    pr_number: input.prNumber || '',
    pr_date: input.prDate || '',
    pr_by: input.prBy || '',
    vendor_id: input.vendorId,
    vendor_name: input.vendorName,
    vendor_address: input.vendorAddress || '',
    department: input.department || '',
    group: input.group || '',
    gate_entry_ids: input.gateEntryIds,
    items: input.items.map(fromLineItem),
    remarks: input.remarks || '',
    prepared_by: fromSigner(input.preparedBy),
  });
  const grnNumber = (data as { grn_number: string }).grn_number;
  return getGrnById(grnNumber);
};

export const actionGrn = async (
  grnNo: string,
  action: 'verify' | 'approve' | 'reject',
  actor: GrnSigner,
  reason?: string,
): Promise<GRNRecord> => {
  await apiPost('/admin_grn_inspection/action', {
    grn_number: grnNo,
    action,
    staff_id: actor.staffId,
    name: actor.name,
    designation: actor.designation || '',
    reason: reason || null,
  });
  return getGrnById(grnNo);
};

export const resubmitGrn = async (input: ResubmitGrnInput): Promise<GRNRecord> => {
  await apiPost('/admin_grn_inspection/resubmit', {
    grn_number: input.grnNo,
    gate_entry_ids: input.gateEntryIds,
    items: input.items.map(fromLineItem),
    remarks: input.remarks || '',
    prepared_by: fromSigner(input.preparedBy),
  });
  return getGrnById(input.grnNo);
};

export const updateGrn = async (input: ResubmitGrnInput): Promise<GRNRecord> => {
  const res = await fetch(`${baseUrl()}/admin_grn_inspection/update_grn/${encodeURIComponent(input.grnNo)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      gate_entry_ids: input.gateEntryIds,
      items: input.items.map(fromLineItem),
      remarks: input.remarks || '',
      prepared_by: fromSigner(input.preparedBy),
      resend_for_approval: Boolean(input.resendForApproval),
      reset_approval_workflow: Boolean(input.resendForApproval),
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Failed to update GRN (HTTP ${res.status})`);
  }
  return getGrnById(input.grnNo);
};

export const deleteGrn = async (grnNo: string): Promise<void> => {
  const res = await fetch(`${baseUrl()}/admin_grn_inspection/delete_grn/${encodeURIComponent(grnNo)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Failed to delete GRN (HTTP ${res.status})`);
  }
};

export const getPendingGrns = async (stage: 'verification' | 'approval'): Promise<GRNRecord[]> => {
  const data = await apiGet<{ grns: Record<string, unknown>[] }>(`/admin_grn_inspection/get_pending/${stage}`);
  return (data.grns || []).map(toGrnRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const listGrns = async (): Promise<GRNRecord[]> => {
  const data = await apiGet<{ grns: Record<string, unknown>[] }>('/admin_grn_inspection/list');
  return (data.grns || []).map(toGrnRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const getGrnsByOrder = async (orderNumber: string): Promise<GRNRecord[]> => {
  const data = await apiGet<{ grns: Record<string, unknown>[] }>(
    `/admin_grn_inspection/get_by_order/${encodeURIComponent(orderNumber)}`,
  );
  return (data.grns || []).map(toGrnRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const getGrnById = async (grnNo: string): Promise<GRNRecord> => {
  const data = await apiGet<{ grn: Record<string, unknown> }>(`/admin_grn_inspection/get_by_id/${encodeURIComponent(grnNo)}`);
  return toGrnRecord(data.grn);
};
