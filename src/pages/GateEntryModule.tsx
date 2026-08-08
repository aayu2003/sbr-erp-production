import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DoorOpen,
  Search,
  Plus,
  X,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  Hash,
  Building2,
  Calendar,
  ChevronDown,
  Settings,
  ClipboardCheck,
  MapPin,
  Trash2,
  Warehouse,
  Printer,
  Edit3,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import { formatDateDDMMYYYY } from '@/lib/dateFormat';
import { useAuth } from '@/context/AuthContext';
import logo3f from '@/Assets/3f-logo.png';
import {
  createGateEntry,
  deleteGateEntry,
  getGateEntries,
  listGrns,
  updateGateEntry,
  type GateEntryRecord,
  type GateEntryInput,
  type GateEntryType,
  type GRNRecord,
} from '@/lib/grnApi';

type VendorOption = {
  vendor_id: string;
  vendor_name: string;
  firm_name?: string;
};

type DestinationType = 'Store' | 'Site';

type ClusterOption = {
  id: string;
  name: string;
};

type LandParcelOption = {
  id: string;
  name: string;
  ownerName: string;
  clusterId: string;
  detail: string;
};

type GateDefinition = {
  id: string;
  gateNo: string;
  locationType: DestinationType;
  locationId: string;
  locationName: string;
};

type GateEntryMetadata = {
  destinationType: DestinationType;
  destinationId: string;
  destinationName: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  itemUnit?: string;
  itemQuantity?: number;
  siteEntryNo?: string;
  outwardToType?: string;
  outwardToId?: string;
  outwardToName?: string;
  outwardContactPerson?: string;
  outwardMobile?: string;
  outwardPurpose?: string;
};

const GATE_CONFIG_KEY = 'farm-connect.gate-entry-config.v1';
const GATE_ENTRY_METADATA_KEY = 'farm-connect.gate-entry-metadata.v1';
const GATE_ENTRY_OVERRIDES_KEY = 'farm-connect.gate-entry-overrides.v1';
const DELETED_GATE_ENTRIES_KEY = 'farm-connect.deleted-gate-entries.v1';
const DEFAULT_STORES = ['Warehouse A', 'Warehouse B', 'Cold Storage', 'Chemical Store', 'Equipment Room', 'Irrigation Store'];

const readGateDefinitions = (): GateDefinition[] => {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(GATE_CONFIG_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const readGateEntryMetadata = (): Record<string, GateEntryMetadata> => {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(GATE_ENTRY_METADATA_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};

const saveGateEntryMetadata = (entryId: string, metadata: GateEntryMetadata) => {
  const current = readGateEntryMetadata();
  window.localStorage.setItem(GATE_ENTRY_METADATA_KEY, JSON.stringify({ ...current, [entryId]: metadata }));
};

const readGateEntryOverrides = (): Record<string, Partial<GateEntryRecord>> => {
  try {
    const value = JSON.parse(window.localStorage.getItem(GATE_ENTRY_OVERRIDES_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
};

const readDeletedGateEntries = (): string[] => {
  try {
    const value = JSON.parse(window.localStorage.getItem(DELETED_GATE_ENTRIES_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
};

const nextSiteEntryNumber = (landCode: string) => {
  const prefix = `SBRPL/SITE/${landCode}/`;
  const existing = Object.values(readGateEntryMetadata())
    .map((entry) => entry.siteEntryNo || '')
    .filter((entryNo) => entryNo.startsWith(prefix))
    .map((entryNo) => Number(entryNo.slice(prefix.length)))
    .filter(Number.isFinite);
  return `${prefix}${String((existing.length ? Math.max(...existing) : 0) + 1).padStart(3, '0')}`;
};

const safeTrim = (v: unknown) => String(v ?? '').trim();

// Shape returned by /purchase_flow/get_purchase_flows — only the fields needed here.
type ApiPurchaseFlow = {
  comparison_id?: unknown;
  flow_id?: unknown;
  order_number?: unknown;
  order_type?: unknown;
};

// Shape returned by /purchase_flow/get_left_panel_info/{comparison_id} — only the vendor bit.
type LeftPanelInfo = {
  approved_vendor_id?: string;
};

// A vendor's live PO, used to populate the Order Number dropdown once a vendor is picked.
type VendorPo = {
  id: string;
  poNo: string;
  vendorId: string;
};

// Same endpoint/pattern as GRNModule.tsx's fetchPurchaseFlows().
async function fetchPurchaseFlows(): Promise<ApiPurchaseFlow[]> {
  const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
  const url = `${baseUrl}/purchase_flow/get_purchase_flows`;
  let res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (res.status === 405) res = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } });
  const data: { purchase_flows?: unknown } | null = await res.json().catch(() => null);
  const list = data?.purchase_flows;
  return Array.isArray(list) ? (list as ApiPurchaseFlow[]) : [];
}

// Fetches every live PR flow's order number + vendor_id, so the gate entry form can filter
// "which POs belong to this vendor" client-side once a vendor is selected.
async function fetchVendorPos(): Promise<VendorPo[]> {
  const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
  const flows = await fetchPurchaseFlows();
  const prFlows = flows.filter((f) => safeTrim(f.order_type).toUpperCase() === 'PR');

  const results = await Promise.all(prFlows.map(async (flow): Promise<VendorPo | null> => {
    const comparisonId = safeTrim(flow.comparison_id);
    const poNo = safeTrim(flow.order_number);
    if (!comparisonId || !poNo) return null;
    try {
      const res = await fetch(`${baseUrl}/purchase_flow/get_left_panel_info/${encodeURIComponent(comparisonId)}`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const info: LeftPanelInfo | null = await res.json().catch(() => null);
      const vendorId = safeTrim(info?.approved_vendor_id);
      if (!vendorId) return null;
      return { id: safeTrim(flow.flow_id) || comparisonId, poNo, vendorId };
    } catch {
      return null;
    }
  }));

  return results.filter((r): r is VendorPo => r !== null);
}

const nowDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const EMPTY_FORM = {
  entryDate: nowDate(),
  entryTime: nowTime(),
  gateNo: '',
  entryType: 'Inward' as GateEntryType,
  destinationType: 'Store' as DestinationType,
  clusterId: '',
  destinationId: '',
  vendorId: '',
  otherVendorName: '',
  otherVendorContact: '',
  otherVendorMobile: '',
  otherVendorGstin: '',
  outwardToType: 'Vendor',
  outwardToId: '',
  outwardToName: '',
  outwardContactPerson: '',
  outwardMobile: '',
  outwardPurpose: '',
  orderNumber: '',
  invoiceNumber: '',
  invoiceDate: '',
  challanNumber: '',
  challanDate: '',
  lrNumber: '',
  lrDate: '',
  ewayBillNumber: '',
};

const formatDateTime = (date: string, time: string) => {
  return `${formatDateDDMMYYYY(date, date)} · ${time}`;
};

const textInputCls = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/10';
const fieldLabelCls = 'mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500';
const selectCls = `${textInputCls} appearance-none pr-10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`;

function NewGateEntryModal({
  vendors,
  isLoadingVendors,
  vendorPos,
  isLoadingPos,
  gates,
  stores,
  clusters,
  landParcels,
  editingEntry,
  onClose,
  onCreated,
}: {
  vendors: VendorOption[];
  isLoadingVendors: boolean;
  vendorPos: VendorPo[];
  isLoadingPos: boolean;
  gates: GateDefinition[];
  stores: string[];
  clusters: ClusterOption[];
  landParcels: LandParcelOption[];
  editingEntry?: GateEntryRecord | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const editingMetadata = editingEntry ? readGateEntryMetadata()[editingEntry.enteryId] : undefined;
  const [form, setForm] = useState(() => {
    if (!editingEntry) return { ...EMPTY_FORM };
    const destinationType = editingEntry.destinationType || editingMetadata?.destinationType || 'Store';
    const destinationId = editingEntry.destinationId || editingMetadata?.destinationId || '';
    const parcel = landParcels.find((item) => item.id === destinationId);
    const hasApprovedVendor = vendors.some((vendor) => vendor.vendor_id === editingEntry.vendorId);
    return {
      ...EMPTY_FORM,
      entryDate: editingEntry.entryDate,
      entryTime: editingEntry.entryTime,
      gateNo: editingEntry.gateNo === 'SITE' ? '' : editingEntry.gateNo,
      entryType: editingEntry.entryType,
      destinationType,
      clusterId: parcel?.clusterId || '',
      destinationId,
      vendorId: editingEntry.entryType === 'Inward' ? (hasApprovedVendor ? editingEntry.vendorId : '__other__') : '',
      otherVendorName: hasApprovedVendor ? '' : editingEntry.vendorName || '',
      otherVendorContact: editingEntry.vendorContactPerson || '',
      otherVendorMobile: editingEntry.vendorMobile || '',
      otherVendorGstin: editingEntry.vendorGstin || '',
      outwardToType: editingEntry.outwardToType || editingMetadata?.outwardToType || 'Vendor',
      outwardToId: editingEntry.outwardToId || editingMetadata?.outwardToId || '',
      outwardToName: editingEntry.outwardToName || editingMetadata?.outwardToName || '',
      outwardContactPerson: editingEntry.outwardContactPerson || editingMetadata?.outwardContactPerson || '',
      outwardMobile: editingEntry.outwardMobile || editingMetadata?.outwardMobile || '',
      outwardPurpose: editingEntry.outwardPurpose || editingMetadata?.outwardPurpose || '',
      orderNumber: editingEntry.orderNumber || '',
      invoiceNumber: editingEntry.invoiceNumber || '',
      invoiceDate: editingEntry.invoiceDate || '',
      challanNumber: editingEntry.challanNumber || '',
      challanDate: editingEntry.challanDate || '',
      lrNumber: editingEntry.lrNumber || '',
      lrDate: editingEntry.lrDate || '',
      ewayBillNumber: editingEntry.ewayBillNumber || '',
    };
  });
  const [submitting, setSubmitting] = useState(false);

  const selectedVendor = vendors.find((v) => v.vendor_id === form.vendorId) ?? null;
  const isOtherVendor = form.vendorId === '__other__';
  const posForVendor = useMemo(
    () => (form.vendorId ? vendorPos.filter((p) => p.vendorId === form.vendorId) : []),
    [vendorPos, form.vendorId],
  );
  const destinations = form.destinationType === 'Store'
    ? stores.map((name) => ({ id: name, name, detail: 'Inventory Store' }))
    : landParcels
      .filter((parcel) => parcel.clusterId === form.clusterId)
      .map((parcel) => ({ id: parcel.id, name: `${parcel.id} — ${parcel.ownerName || 'Owner not recorded'}`, detail: parcel.detail }));
  const selectedDestination = destinations.find((destination) => destination.id === form.destinationId) ?? null;
  const matchingGates = gates.filter((gate) => (
    gate.locationType === form.destinationType
    && (gate.locationId === form.destinationId || gate.locationName === selectedDestination?.name)
  ));
  const siteEntryNoPreview = form.destinationType === 'Site' && form.destinationId
    ? editingEntry?.siteEntryNo || editingMetadata?.siteEntryNo || nextSiteEntryNumber(form.destinationId)
    : '';
  const outwardRecipientOptions = form.outwardToType === 'Vendor'
    ? vendors.map((vendor) => ({ id: vendor.vendor_id, name: vendor.firm_name || vendor.vendor_name, detail: 'Vendor' }))
    : form.outwardToType === 'Land Parcel'
      ? landParcels.map((parcel) => ({ id: parcel.id, name: `${parcel.id} — ${parcel.ownerName || 'Owner not recorded'}`, detail: parcel.detail }))
      : [];
  const selectedOutwardRecipient = outwardRecipientOptions.find((option) => option.id === form.outwardToId) ?? null;
  const isManualOutwardRecipient = form.outwardToType === 'Person' || form.outwardToType === 'Other';

  const handleSubmit = async () => {
    if (form.destinationType === 'Store' && !form.gateNo.trim()) { toast.error('Please select the gate number'); return; }
    if (form.destinationType === 'Site' && !form.clusterId) { toast.error('Please select a cluster'); return; }
    if (!form.destinationId) { toast.error(`Please select a ${form.destinationType === 'Site' ? 'land parcel' : 'store'}`); return; }
    if (form.entryType === 'Inward' && !form.vendorId) { toast.error('Please select a vendor'); return; }
    if (form.entryType === 'Inward' && isOtherVendor && !form.otherVendorName.trim()) { toast.error('Please enter the vendor name'); return; }
    if (form.entryType === 'Outward') {
      if (isManualOutwardRecipient ? !form.outwardToName.trim() : !form.outwardToId) { toast.error('Please enter who the item is going to'); return; }
      if (!form.outwardPurpose.trim()) { toast.error('Please enter the outward purpose'); return; }
    }

    const outwardToName = form.entryType === 'Outward'
      ? (isManualOutwardRecipient ? form.outwardToName.trim() : selectedOutwardRecipient?.name || '')
      : undefined;
    const resolvedVendorId = form.entryType === 'Inward'
      ? (isOtherVendor ? 'MANUAL_VENDOR' : form.vendorId)
      : (form.outwardToType === 'Vendor' ? form.outwardToId : 'NOT_APPLICABLE');
    const resolvedVendorName = form.entryType === 'Inward'
      ? (isOtherVendor ? form.otherVendorName.trim() : selectedVendor?.firm_name || selectedVendor?.vendor_name || form.vendorId)
      : (form.outwardToType === 'Vendor' ? outwardToName || 'Vendor' : 'Not Applicable');

    setSubmitting(true);
    try {
      const payload: GateEntryInput = {
        siteEntryNo: siteEntryNoPreview || undefined,
        entryDate: form.entryDate,
        entryTime: form.entryTime,
        gateNo: form.destinationType === 'Site' ? 'SITE' : form.gateNo.trim(),
        entryType: form.entryType,
        vendorId: resolvedVendorId,
        vendorName: resolvedVendorName,
        vendorContactPerson: form.entryType === 'Inward' && isOtherVendor ? form.otherVendorContact.trim() || undefined : undefined,
        vendorMobile: form.entryType === 'Inward' && isOtherVendor ? form.otherVendorMobile.trim() || undefined : undefined,
        vendorGstin: form.entryType === 'Inward' && isOtherVendor ? form.otherVendorGstin.trim() || undefined : undefined,
        destinationType: form.destinationType,
        destinationId: form.destinationId,
        destinationName: selectedDestination?.name || form.destinationId,
        outwardToType: form.entryType === 'Outward' ? form.outwardToType : undefined,
        outwardToId: form.entryType === 'Outward' && !isManualOutwardRecipient ? form.outwardToId : undefined,
        outwardToName,
        outwardContactPerson: form.entryType === 'Outward' ? form.outwardContactPerson.trim() || undefined : undefined,
        outwardMobile: form.entryType === 'Outward' ? form.outwardMobile.trim() || undefined : undefined,
        outwardPurpose: form.entryType === 'Outward' ? form.outwardPurpose.trim() : undefined,
        orderNumber: form.orderNumber.trim() || undefined,
        invoiceNumber: form.invoiceNumber.trim() || undefined,
        invoiceDate: form.invoiceDate || undefined,
        challanNumber: form.challanNumber.trim() || undefined,
        challanDate: form.challanDate || undefined,
        lrNumber: form.lrNumber.trim() || undefined,
        lrDate: form.lrDate || undefined,
        ewayBillNumber: form.ewayBillNumber.trim() || undefined,
      };
      let enteryId = editingEntry?.enteryId || '';
      if (editingEntry) {
        try {
          await updateGateEntry(editingEntry.enteryId, payload);
        } catch {
          const overrides = readGateEntryOverrides();
          window.localStorage.setItem(GATE_ENTRY_OVERRIDES_KEY, JSON.stringify({
            ...overrides,
            [editingEntry.enteryId]: { ...editingEntry, ...payload, enteryId: editingEntry.enteryId },
          }));
        }
      } else {
        const created = await createGateEntry(payload);
        enteryId = created.enteryId;
      }
      saveGateEntryMetadata(enteryId, {
        destinationType: form.destinationType,
        destinationId: form.destinationId,
        destinationName: selectedDestination?.name || form.destinationId,
        siteEntryNo: siteEntryNoPreview || undefined,
        outwardToType: form.entryType === 'Outward' ? form.outwardToType : undefined,
        outwardToId: form.entryType === 'Outward' && !isManualOutwardRecipient ? form.outwardToId : undefined,
        outwardToName,
        outwardContactPerson: form.entryType === 'Outward' ? form.outwardContactPerson.trim() || undefined : undefined,
        outwardMobile: form.entryType === 'Outward' ? form.outwardMobile.trim() || undefined : undefined,
        outwardPurpose: form.entryType === 'Outward' ? form.outwardPurpose.trim() : undefined,
      });
      toast.success(editingEntry ? `${siteEntryNoPreview || enteryId} updated` : `${siteEntryNoPreview || enteryId} logged`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create gate entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-3xl animate-in flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-50 shadow-[0_28px_80px_-24px_rgba(2,44,39,0.55)] duration-200 zoom-in-95">
        <div className="flex shrink-0 items-center justify-between bg-[#0D3A35] px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-2.5 ring-1 ring-white/15">
              <DoorOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">{editingEntry ? 'Edit Gate Entry' : 'New Gate Entry'}</h3>
              <p className="mt-0.5 text-xs text-white/70">{editingEntry ? `Update ${editingEntry.siteEntryNo || editingEntry.enteryId}` : 'Record an inward or outward gate movement.'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-white/75 transition hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          {/* Entry Type toggle */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0D3A35]">Movement Details</p>
                <p className="mt-1 text-xs text-slate-500">Select the direction and record the gate timestamp.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Entry no. auto-generated</span>
            </div>
            <label className={fieldLabelCls}>
              Entry Type <span className="text-red-500">*</span>
            </label>
            <div className="grid w-full grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
              {(['Inward', 'Outward'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, entryType: type }))}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all',
                    form.entryType === type
                      ? 'bg-[#0D3A35] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-[#0D3A35]',
                  )}
                >
                  {type === 'Inward' ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
                  {type}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <label className={fieldLabelCls}>{form.entryType === 'Outward' ? 'From' : 'Delivery Destination'} <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
                {(['Store', 'Site'] as DestinationType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((previous) => ({ ...previous, destinationType: type, clusterId: '', destinationId: '', gateNo: '' }))}
                    className={cn(
                      'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all',
                      form.destinationType === type ? 'bg-white text-[#0D3A35] shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-[#0D3A35]',
                    )}
                  >
                    {type === 'Store' ? <Warehouse className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                    {type} Entry
                  </button>
                ))}
              </div>
            </div>

          {/* Date, time, destination and gate */}
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={fieldLabelCls}>Entry Date</label>
              <input
                type="date"
                value={form.entryDate}
                onChange={(e) => setForm((p) => ({ ...p, entryDate: e.target.value }))}
                className={textInputCls}
              />
            </div>
            <div>
              <label className={fieldLabelCls}>Entry Time</label>
              <input
                type="time"
                value={form.entryTime}
                onChange={(e) => setForm((p) => ({ ...p, entryTime: e.target.value }))}
                className={textInputCls}
              />
            </div>
            {form.destinationType === 'Site' && (
              <div>
                <label className={fieldLabelCls}>Cluster <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select
                    value={form.clusterId}
                    onChange={(event) => setForm((previous) => ({ ...previous, clusterId: event.target.value, destinationId: '', gateNo: '' }))}
                    className={selectCls}
                  >
                    <option value="">Select cluster</option>
                    {clusters.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            )}
            <div>
              <label className={fieldLabelCls}>{form.destinationType === 'Site' ? 'Land Parcel' : 'Store'} <span className="text-red-500">*</span></label>
              <div className="relative">
                <select
                  value={form.destinationId}
                  onChange={(event) => setForm((previous) => ({ ...previous, destinationId: event.target.value, gateNo: '' }))}
                  disabled={form.destinationType === 'Site' && !form.clusterId}
                  className={selectCls}
                >
                  <option value="">{form.destinationType === 'Site' ? (form.clusterId ? 'Select land parcel' : 'Select cluster first') : 'Select store'}</option>
                  {destinations.map((destination) => (
                    <option key={destination.id} value={destination.id}>{destination.name} · {destination.detail}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
            {form.destinationType === 'Store' ? (
              <div>
                <label className={fieldLabelCls}>Gate No. <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select
                    value={form.gateNo}
                    onChange={(event) => setForm((previous) => ({ ...previous, gateNo: event.target.value }))}
                    disabled={!form.destinationId || matchingGates.length === 0}
                    className={selectCls}
                  >
                    <option value="">
                      {!form.destinationId ? 'Select store first' : matchingGates.length ? 'Select gate' : 'No gate configured for this store'}
                    </option>
                    {matchingGates.map((gate) => <option key={gate.id} value={gate.gateNo}>{gate.gateNo}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            ) : (
              <div>
                <label className={fieldLabelCls}>Site Entry No.</label>
                <div className="flex h-11 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 font-mono text-sm font-semibold text-[#0D3A35]">
                  {siteEntryNoPreview || 'Generated after selecting land parcel'}
                </div>
              </div>
            )}
          </div>
          </section>

          {form.entryType === 'Outward' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0D3A35]">To Details</p>
                <p className="mt-1 text-xs text-slate-500">Record who will receive the item and why it is moving outward.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={fieldLabelCls}>Recipient Type <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select
                      value={form.outwardToType}
                      onChange={(event) => setForm((previous) => ({ ...previous, outwardToType: event.target.value, outwardToId: '', outwardToName: '', outwardContactPerson: '', outwardMobile: '' }))}
                      className={selectCls}
                    >
                      {['Vendor', 'Land Parcel', 'Person', 'Other'].map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                {isManualOutwardRecipient ? (
                  <div>
                    <label className={fieldLabelCls}>Recipient / Destination <span className="text-red-500">*</span></label>
                    <input
                      value={form.outwardToName}
                      onChange={(event) => setForm((previous) => ({ ...previous, outwardToName: event.target.value }))}
                      placeholder={form.outwardToType === 'Person' ? 'Enter person name' : 'Enter recipient or destination'}
                      className={textInputCls}
                    />
                  </div>
                ) : (
                  <div>
                    <label className={fieldLabelCls}>{form.outwardToType} <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select
                        value={form.outwardToId}
                        onChange={(event) => setForm((previous) => ({ ...previous, outwardToId: event.target.value }))}
                        className={selectCls}
                      >
                        <option value="">Select {form.outwardToType.toLowerCase()}</option>
                        {outwardRecipientOptions.map((option) => <option key={option.id} value={option.id}>{option.name}{option.detail ? ` · ${option.detail}` : ''}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>
                )}

                <div>
                  <label className={fieldLabelCls}>Contact Person</label>
                  <input
                    value={form.outwardContactPerson}
                    onChange={(event) => setForm((previous) => ({ ...previous, outwardContactPerson: event.target.value }))}
                    placeholder="Optional"
                    className={textInputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Mobile Number</label>
                  <input
                    type="tel"
                    value={form.outwardMobile}
                    onChange={(event) => setForm((previous) => ({ ...previous, outwardMobile: event.target.value }))}
                    placeholder="Optional"
                    className={textInputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={fieldLabelCls}>Purpose <span className="text-red-500">*</span></label>
                  <textarea
                    value={form.outwardPurpose}
                    onChange={(event) => setForm((previous) => ({ ...previous, outwardPurpose: event.target.value }))}
                    placeholder="Enter the purpose of this outward movement"
                    rows={3}
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/10"
                  />
                </div>
              </div>
            </section>
          )}

          {/* Vendor — Inward only */}
          {form.entryType === 'Inward' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0D3A35]">Vendor & Documents</p>
              <p className="mt-1 text-xs text-slate-500">Select the vendor and supporting documents.</p>
            </div>
            <label className={fieldLabelCls}>
              Vendor <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={form.vendorId}
                onChange={(e) => setForm((p) => ({
                  ...p,
                  vendorId: e.target.value,
                  orderNumber: '',
                  otherVendorName: '',
                  otherVendorContact: '',
                  otherVendorMobile: '',
                  otherVendorGstin: '',
                }))}
                disabled={isLoadingVendors}
                className={selectCls}
              >
                <option value="">{isLoadingVendors ? 'Loading vendors…' : 'Select a vendor'}</option>
                {vendors.map((v) => (
                  <option key={v.vendor_id} value={v.vendor_id}>{v.firm_name || v.vendor_name}</option>
                ))}
                <option value="__other__">Other Vendor — Manual Entry</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>

            {isOtherVendor && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-amber-800">Manual Vendor Details</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={fieldLabelCls}>Vendor / Firm Name <span className="text-red-500">*</span></label>
                    <input
                      value={form.otherVendorName}
                      onChange={(event) => setForm((previous) => ({ ...previous, otherVendorName: event.target.value }))}
                      placeholder="Enter vendor or firm name"
                      className={textInputCls}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Contact Person</label>
                    <input
                      value={form.otherVendorContact}
                      onChange={(event) => setForm((previous) => ({ ...previous, otherVendorContact: event.target.value }))}
                      placeholder="Optional"
                      className={textInputCls}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Mobile Number</label>
                    <input
                      type="tel"
                      value={form.otherVendorMobile}
                      onChange={(event) => setForm((previous) => ({ ...previous, otherVendorMobile: event.target.value }))}
                      placeholder="Optional"
                      className={textInputCls}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={fieldLabelCls}>GSTIN</label>
                    <input
                      value={form.otherVendorGstin}
                      onChange={(event) => setForm((previous) => ({ ...previous, otherVendorGstin: event.target.value.toUpperCase() }))}
                      placeholder="Optional"
                      className={textInputCls}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
              <div>
                <label className={fieldLabelCls}>Order Number</label>
                <div className="relative">
                  <select
                    value={form.orderNumber}
                    onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))}
                    disabled={!form.vendorId || isLoadingPos || posForVendor.length === 0}
                    className={selectCls}
                  >
                    <option value="">
                      {!form.vendorId
                        ? 'Select a vendor first'
                        : isLoadingPos
                          ? 'Loading live POs…'
                          : posForVendor.length === 0
                            ? 'No open POs for this vendor'
                            : 'Select order number'}
                    </option>
                    {posForVendor.map((p) => (
                      <option key={p.id} value={p.poNo}>{p.poNo}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={fieldLabelCls}>Invoice Number</label>
                  <input
                    type="text"
                    value={form.invoiceNumber}
                    onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Invoice Date</label>
                  <input
                    type="date"
                    value={form.invoiceDate}
                    onChange={(e) => setForm((p) => ({ ...p, invoiceDate: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Challan Number</label>
                  <input
                    type="text"
                    value={form.challanNumber}
                    onChange={(e) => setForm((p) => ({ ...p, challanNumber: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>Challan Date</label>
                  <input
                    type="date"
                    value={form.challanDate}
                    onChange={(e) => setForm((p) => ({ ...p, challanDate: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>LR Number</label>
                  <input
                    type="text"
                    value={form.lrNumber}
                    onChange={(e) => setForm((p) => ({ ...p, lrNumber: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
                <div>
                  <label className={fieldLabelCls}>LR Date</label>
                  <input
                    type="date"
                    value={form.lrDate}
                    onChange={(e) => setForm((p) => ({ ...p, lrDate: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
              </div>

              <div>
                <label className={fieldLabelCls}>E-way Bill Number</label>
                <input
                  type="text"
                  value={form.ewayBillNumber}
                  onChange={(e) => setForm((p) => ({ ...p, ewayBillNumber: e.target.value }))}
                  className={textInputCls}
                />
              </div>
            </div>
          </section>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={cn(
              'rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-colors',
              submitting ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-[#0D3A35] text-white hover:bg-[#092e2a]',
            )}
          >
            {submitting ? 'Saving…' : editingEntry ? 'Save Changes' : 'Create Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GateEntryModule() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<GateEntryRecord[]>([]);
  const [grns, setGrns] = useState<GRNRecord[]>([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [q, setQ] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [draftPeriodFrom, setDraftPeriodFrom] = useState('');
  const [draftPeriodTo, setDraftPeriodTo] = useState('');
  const periodInitialized = useRef(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<GateEntryRecord | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<GateEntryRecord | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [activeTab, setActiveTab] = useState<'gate-entry' | 'configure'>('gate-entry');
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(false);
  const [vendorPos, setVendorPos] = useState<VendorPo[]>([]);
  const [isLoadingPos, setIsLoadingPos] = useState(false);
  const [gates, setGates] = useState<GateDefinition[]>(readGateDefinitions);
  const [clusters, setClusters] = useState<ClusterOption[]>([]);
  const [landParcels, setLandParcels] = useState<LandParcelOption[]>([]);
  const [isLoadingLandParcels, setIsLoadingLandParcels] = useState(false);
  const [gateForm, setGateForm] = useState({ gateNo: '', locationType: 'Store' as DestinationType, clusterId: '', locationId: '' });
  const [stores, setStores] = useState<string[]>(DEFAULT_STORES);
  const entryMetadata = readGateEntryMetadata();

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingEntries(true);
    const [entryResult, grnResult] = await Promise.allSettled([getGateEntries(), listGrns()]);
    if (entryResult.status === 'fulfilled') {
      const overrides = readGateEntryOverrides();
      const deletedIds = new Set(readDeletedGateEntries());
      setEntries(entryResult.value
        .filter((entry) => !deletedIds.has(entry.enteryId))
        .map((entry) => ({ ...entry, ...overrides[entry.enteryId] })));
    } else if (!silent) {
      toast.error(entryResult.reason instanceof Error ? entryResult.reason.message : 'Failed to load gate entries');
    }
    if (grnResult.status === 'fulfilled') setGrns(grnResult.value);
    if (!silent) setIsLoadingEntries(false);
  }, []);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => { void refresh(true); }, 30_000);
    const handleFocus = () => { void refresh(true); };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [refresh]);

  useEffect(() => {
    setIsLoadingVendors(true);
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    fetch(`${baseUrl}/purchase_flow/get_vendors`)
      .then((r) => r.json())
      .then((data: { vendors?: unknown }) => {
        if (Array.isArray(data?.vendors)) {
          setVendors((data.vendors as Record<string, unknown>[]).map((v) => ({
            vendor_id: String(v?.vendor_id || ''),
            vendor_name: String(v?.vendor_name || ''),
            firm_name: v?.firm_name ? String(v.firm_name) : undefined,
          })).filter((v) => v.vendor_id));
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingVendors(false));
  }, []);

  useEffect(() => {
    setIsLoadingPos(true);
    fetchVendorPos()
      .then(setVendorPos)
      .catch(() => setVendorPos([]))
      .finally(() => setIsLoadingPos(false));
  }, []);

  // Same store list Inventory.tsx manages (Configure tab → Stores) — fetched fresh here
  // rather than read from localStorage, so the two pages never drift apart.
  useEffect(() => {
    let cancelled = false;
    const loadStores = async () => {
      try {
        const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
        const response = await fetch(`${baseUrl}/inventory/get_inventory_config`, { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => null);
        const names = Array.isArray(data?.stores)
          ? (data.stores as Record<string, unknown>[]).map((store) => String(store?.name || '')).filter(Boolean)
          : [];
        if (!cancelled && names.length > 0) setStores(names);
      } catch {
        // keep the DEFAULT_STORES fallback already in state
      }
    };
    void loadStores();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLandDirectory = async () => {
      setIsLoadingLandParcels(true);
      const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
      try {
        const [clustersResponse, zonesResponse, blocksResponse, farmsResponse, ownersResponse] = await Promise.all([
          fetch(`${baseUrl}/farmer_managment/get_clusters`, { headers: { Accept: 'application/json' } }),
          fetch(`${baseUrl}/farmer_managment/get_zones`, { headers: { Accept: 'application/json' } }),
          fetch(`${baseUrl}/farmer_managment/get_blocks`, { headers: { Accept: 'application/json' } }),
          fetch(`${baseUrl}/farmer_managment/get_farms`, { headers: { Accept: 'application/json' } }),
          fetch(`${baseUrl}/admin_ops_requests/get_farm_and_farmer`, { headers: { Accept: 'application/json' } }),
        ]);
        const [clustersData, zonesData, blocksData, farmsData, ownersData] = await Promise.all([
          clustersResponse.json(), zonesResponse.json(), blocksResponse.json(), farmsResponse.json(), ownersResponse.json().catch(() => null),
        ]);
        if (cancelled) return;
        const loadedClusters: ClusterOption[] = Array.isArray(clustersData?.clusters)
          ? clustersData.clusters.map((item: { cluster_id: string; cluster_name: string }) => ({ id: String(item.cluster_id || ''), name: String(item.cluster_name || item.cluster_id || '') })).filter((item: ClusterOption) => item.id)
          : [];
        const clusterByZone = new Map<string, string>((Array.isArray(zonesData?.zones) ? zonesData.zones : []).map((zone: Record<string, unknown>) => [String(zone.zone_id || ''), String(zone.cluster_id || '')]));
        const zoneByBlock = new Map<string, string>((Array.isArray(blocksData?.blocks) ? blocksData.blocks : []).map((block: Record<string, unknown>) => [String(block.block_id || ''), String(block.zone_id || '')]));
        const ownerRows = [ownersData?.farm_farmer_mapping, ownersData?.farms, ownersData?.data, ownersData?.items].find(Array.isArray) || [];
        const ownerByFarm = new Map<string, string>((ownerRows as Record<string, unknown>[]).map((row) => [
          String(row.farm_id || row.land_id || row.id || ''),
          String(row.owner_name || row.farmer_name || row.name || ''),
        ]));
        const farms = Array.isArray(farmsData?.farms) ? farmsData.farms : [];
        const loadedParcels: LandParcelOption[] = farms.map((farm: Record<string, any>, index: number) => {
          const id = String(farm.farm_id || farm.land_id || farm.id || `land-${index + 1}`);
          const blockId = String(farm.block_id || '');
          const clusterId = String(farm.cluster_id || clusterByZone.get(zoneByBlock.get(blockId) || '') || '');
          const ownerName = String(ownerByFarm.get(id) || farm.owner_name || farm.farmer_name || '');
          const village = String(farm.land_data?.village || farm.basic_details?.village || farm.village || '');
          const area = Number(farm.area || farm.total_area || farm.basic_details?.total_area || 0);
          return { id, name: id, ownerName, clusterId, detail: [village, area > 0 ? `${area.toLocaleString('en-IN')} acres` : ''].filter(Boolean).join(' · ') };
        }).filter((parcel: LandParcelOption) => parcel.id && parcel.clusterId);
        setClusters(loadedClusters);
        setLandParcels(loadedParcels);
      } catch {
        if (!cancelled) { setClusters([]); setLandParcels([]); }
      } finally {
        if (!cancelled) setIsLoadingLandParcels(false);
      }
    };
    void loadLandDirectory();
    return () => { cancelled = true; };
  }, []);

  const grnByGateEntry = useMemo(() => {
    const lookup = new Map<string, GRNRecord>();
    grns.forEach((grn) => grn.gateEntryIds.forEach((entryId) => lookup.set(entryId, grn)));
    return lookup;
  }, [grns]);

  useEffect(() => {
    if (periodInitialized.current || entries.length === 0) return;
    const dates = entries.map((entry) => entry.entryDate).filter(Boolean).sort();
    if (dates.length) {
      setPeriodFrom(dates[0]);
      setPeriodTo(dates[dates.length - 1]);
      periodInitialized.current = true;
    }
  }, [entries]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (periodFrom && e.entryDate < periodFrom) return false;
      if (periodTo && e.entryDate > periodTo) return false;
      if (!query) return true;
      const grn = grnByGateEntry.get(e.enteryId);
      const destination = e.destinationName || entryMetadata[e.enteryId]?.destinationName || '';
      const savedItem = entryMetadata[e.enteryId];
      const outwardText = [e.outwardToName, e.outwardPurpose, savedItem?.outwardToName, savedItem?.outwardPurpose].filter(Boolean).join(' ');
      const itemText = [
        e.itemName,
        e.itemCode,
        savedItem?.itemName,
        savedItem?.itemCode,
        grn?.items.map((item) => `${item.description} ${item.itemCode || ''}`).join(' '),
      ].filter(Boolean).join(' ');
      return e.enteryId.toLowerCase().includes(query) ||
        e.vendorName.toLowerCase().includes(query) ||
        e.gateNo.toLowerCase().includes(query) ||
        (e.orderNumber || '').toLowerCase().includes(query) ||
        (e.invoiceNumber || '').toLowerCase().includes(query) ||
        (e.ewayBillNumber || '').toLowerCase().includes(query) ||
        (e.usedInGrn || grn?.grnNo || '').toLowerCase().includes(query) ||
        (e.siteEntryNo || savedItem?.siteEntryNo || '').toLowerCase().includes(query) ||
        outwardText.toLowerCase().includes(query) ||
        destination.toLowerCase().includes(query) ||
        itemText.toLowerCase().includes(query);
    });
  }, [entries, entryMetadata, grnByGateEntry, periodFrom, periodTo, q]);

  const configuredGates = useMemo(() => Array.from(new Set(gates.map((gate) => gate.gateNo))).sort(), [gates]);

  const saveGates = (next: GateDefinition[]) => {
    setGates(next);
    window.localStorage.setItem(GATE_CONFIG_KEY, JSON.stringify(next));
  };

  const addGate = () => {
    const gateNo = gateForm.gateNo.trim();
    if (!gateNo) { toast.error('Please enter a gate number or name'); return; }
    if (gateForm.locationType === 'Site' && !gateForm.clusterId) { toast.error('Please select a cluster'); return; }
    if (!gateForm.locationId) { toast.error(`Please select a ${gateForm.locationType === 'Site' ? 'land parcel' : 'store'}`); return; }
    const locations = gateForm.locationType === 'Store'
      ? stores.map((name) => ({ id: name, name }))
      : landParcels.filter((parcel) => parcel.clusterId === gateForm.clusterId).map((parcel) => ({ id: parcel.id, name: `${parcel.id} — ${parcel.ownerName || 'Owner not recorded'}` }));
    const location = locations.find((item) => item.id === gateForm.locationId);
    if (!location) { toast.error('Selected location is unavailable'); return; }
    const exists = gates.some((gate) => gate.gateNo.toLowerCase() === gateNo.toLowerCase() && gate.locationType === gateForm.locationType && gate.locationId === gateForm.locationId);
    if (exists) { toast.error('This gate is already configured for the selected location'); return; }
    const next = [...gates, {
      id: `gate-${Date.now()}`,
      gateNo,
      locationType: gateForm.locationType,
      locationId: gateForm.locationId,
      locationName: location.name,
    }];
    saveGates(next);
    setGateForm((previous) => ({ ...previous, gateNo: '' }));
    toast.success(`${gateNo} created for ${location.name}`);
  };

  const removeGate = (gateId: string) => {
    saveGates(gates.filter((gate) => gate.id !== gateId));
    toast.success('Gate removed');
  };

  const confirmDeleteEntry = async () => {
    if (!deleteEntry) return;
    setDeletingEntry(true);
    try {
      try {
        await deleteGateEntry(deleteEntry.enteryId);
      } catch {
        const deletedIds = new Set(readDeletedGateEntries());
        deletedIds.add(deleteEntry.enteryId);
        window.localStorage.setItem(DELETED_GATE_ENTRIES_KEY, JSON.stringify(Array.from(deletedIds)));
      }
      setEntries((current) => current.filter((entry) => entry.enteryId !== deleteEntry.enteryId));
      toast.success(`${deleteEntry.siteEntryNo || deleteEntry.enteryId} deleted`);
      setDeleteEntry(null);
    } finally {
      setDeletingEntry(false);
    }
  };

  const openPeriodPicker = () => {
    setDraftPeriodFrom(periodFrom);
    setDraftPeriodTo(periodTo);
    setPeriodPickerOpen(true);
  };

  const applyPeriod = () => {
    if (draftPeriodFrom && draftPeriodTo && draftPeriodFrom > draftPeriodTo) {
      toast.error('From Date cannot be after To Date');
      return;
    }
    setPeriodFrom(draftPeriodFrom);
    setPeriodTo(draftPeriodTo);
    setPeriodPickerOpen(false);
  };

  const printGateEntries = () => {
    if (periodFrom && periodTo && periodFrom > periodTo) { toast.error('From Date cannot be after To Date'); return; }
    if (filtered.length === 0) { toast.error('There are no gate entries to print'); return; }
    const popup = window.open('', '_blank', 'width=1280,height=900');
    if (!popup) { toast.error('Pop-up blocked. Please allow pop-ups to print.'); return; }

    const escapeHtml = (value: unknown) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    const generatedAt = new Date();
    const generatedOn = `${formatDateDDMMYYYY(generatedAt)} ${generatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    const generatedBy = user?.name || user?.username || 'System User';
    const reportId = `GER-${generatedAt.getFullYear()}${String(generatedAt.getMonth() + 1).padStart(2, '0')}${String(generatedAt.getDate()).padStart(2, '0')}-${String(generatedAt.getHours()).padStart(2, '0')}${String(generatedAt.getMinutes()).padStart(2, '0')}`;
    const statementPeriod = periodFrom || periodTo
      ? `${periodFrom ? formatDateDDMMYYYY(periodFrom) : 'Beginning'} to ${periodTo ? formatDateDDMMYYYY(periodTo) : 'Present'}`
      : 'All Available Dates';
    const logoUrl = new URL(logo3f, window.location.origin).href;

    const rows = filtered.map((entry) => {
      const saved = entryMetadata[entry.enteryId];
      const linkedGrn = grnByGateEntry.get(entry.enteryId);
      const entryNo = entry.siteEntryNo || saved?.siteEntryNo || entry.enteryId;
      const itemName = entry.itemName || saved?.itemName || linkedGrn?.items.map((item) => item.description || item.itemCode).filter(Boolean).join(', ') || 'Not Recorded';
      const itemCode = entry.itemCode || saved?.itemCode || linkedGrn?.items[0]?.itemCode || '';
      const quantity = entry.itemQuantity ?? saved?.itemQuantity;
      const unit = entry.itemUnit || saved?.itemUnit || linkedGrn?.items[0]?.uom || '';
      const source = entry.destinationName || saved?.destinationName || 'Not Recorded';
      const outward = entry.outwardToName ? entry : saved;
      const movement = entry.entryType === 'Outward'
        ? `<strong>From:</strong> ${escapeHtml(source)}<br><strong>To:</strong> ${escapeHtml(outward?.outwardToName || 'Not Recorded')}`
        : `<strong>Delivered to:</strong> ${escapeHtml(source)}`;
      const references = entry.entryType === 'Outward'
        ? [outward?.outwardPurpose ? `Purpose: ${outward.outwardPurpose}` : '', outward?.outwardContactPerson ? `Contact: ${outward.outwardContactPerson}` : '', outward?.outwardMobile ? `Mobile: ${outward.outwardMobile}` : '']
        : [entry.orderNumber ? `Order: ${entry.orderNumber}` : '', entry.invoiceNumber ? `Invoice: ${entry.invoiceNumber}` : '', entry.challanNumber ? `Challan: ${entry.challanNumber}` : '', entry.lrNumber ? `LR: ${entry.lrNumber}` : '', entry.ewayBillNumber ? `E-way: ${entry.ewayBillNumber}` : ''];
      return `<tr>
        <td>${escapeHtml(entryNo)}</td>
        <td>${escapeHtml(formatDateTime(entry.entryDate, entry.entryTime))}</td>
        <td>${entry.entryType === 'Outward' && (entry.destinationType || saved?.destinationType) === 'Site' ? '—' : escapeHtml(entry.gateNo)}</td>
        <td>${escapeHtml(entry.entryType)}</td>
        <td><strong>${escapeHtml(itemName)}</strong>${itemCode ? `<small>${escapeHtml(itemCode)}</small>` : ''}</td>
        <td class="num">${quantity != null ? escapeHtml(Number(quantity).toLocaleString('en-IN')) : '—'} ${escapeHtml(unit)}</td>
        <td>${escapeHtml(entry.vendorName === 'Not Applicable' ? '—' : entry.vendorName)}</td>
        <td>${movement}</td>
        <td>${references.filter(Boolean).map(escapeHtml).join('<br>') || '—'}</td>
        <td>${escapeHtml(entry.usedInGrn || linkedGrn?.grnNo || 'Not Generated')}</td>
      </tr>`;
    }).join('');

    const inwardCount = filtered.filter((entry) => entry.entryType === 'Inward').length;
    const outwardCount = filtered.filter((entry) => entry.entryType === 'Outward').length;
    const siteCount = filtered.filter((entry) => (entry.destinationType || entryMetadata[entry.enteryId]?.destinationType) === 'Site').length;

    popup.document.write(`<!doctype html><html><head><title>Gate Entry Register - ${escapeHtml(reportId)}</title><style>
      @page{size:210mm 297mm;margin:8mm}*{box-sizing:border-box}html,body{width:194mm;margin:0;padding:0;-webkit-text-size-adjust:100%;text-size-adjust:100%}body{background:#fff;color:#1e293b;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt}
      .sheet{width:194mm;margin:0;border:.3mm solid #b8c5d1;padding:3mm}.header{text-align:center;border-bottom:.6mm solid #0D3A35;padding-bottom:2.5mm}
      .header img{height:13mm;width:auto}.company{margin-top:.6mm;font-size:14pt;font-weight:900;letter-spacing:.04em}.address{margin-top:.8mm;color:#526173;font-size:7.2pt;line-height:1.35}
      .company-meta{margin-top:.8mm;color:#526173;font-size:7pt}.title{margin-top:2.5mm;background:#0D3A35;color:#fff;padding:1.8mm;text-align:center;font-size:10pt;font-weight:900;letter-spacing:.14em}
      .report-meta{display:grid;grid-template-columns:1.05fr .8fr 1.15fr 1fr 1fr;border:.25mm solid #cbd5e1;border-top:0}.report-meta>div{padding:1.7mm 1.8mm;border-right:.25mm solid #cbd5e1}.report-meta>div:last-child{border-right:0}
      .label{color:#64748b;font-size:6.2pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.value{margin-top:.6mm;font-size:7.6pt;font-weight:800}.section{margin-top:2.5mm;border:.25mm solid #cbd5e1}
      .section-title{border-bottom:.25mm solid #cbd5e1;background:#f1f5f9;padding:1.4mm 1.8mm;color:#334155;font-size:7.4pt;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
      table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:.25mm solid #cbd5e1;padding:1.2mm .8mm;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}
      th{background:#0D3A35;color:#fff;text-align:center;font-size:5.7pt;font-weight:600;text-transform:uppercase;letter-spacing:.01em}td{color:#334155;font-size:6.4pt;line-height:1.3}td strong{color:#1e293b}td small{display:block;margin-top:.3mm;color:#64748b}.num{text-align:right}
      .summary{display:grid;grid-template-columns:repeat(4,1fr)}.summary>div{padding:1.8mm 2mm;border-right:.25mm solid #cbd5e1}.summary>div:last-child{border-right:0}.footer{display:flex;justify-content:space-between;margin-top:2.5mm;border-top:.25mm solid #cbd5e1;padding-top:1.5mm;color:#64748b;font-size:6.2pt}
      @media print{html,body{width:194mm}.sheet{width:194mm;border-color:#b8c5d1}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body><div class="sheet">
      <div class="header"><img src="${logoUrl}" alt="Sai Bioresources"><div class="company">SAI BIORESOURCES PRIVATE LIMITED</div>
      <div class="address">Khasra No. 121/1, Amrit Dairy Farm, Kachandur-Dhour Road, Village Jeora (Jeora-Sirsa), Durg, Chhattisgarh - 491001</div>
      <div class="company-meta">GSTIN: 22ARPCS5442R1ZM &nbsp;|&nbsp; Phone: +91 75870 76870 &nbsp;|&nbsp; Email: rajendra.s@saiobioenergy.com</div></div>
      <div class="title">GATE ENTRY REGISTER</div>
      <div class="report-meta"><div><div class="label">Report ID</div><div class="value">${escapeHtml(reportId)}</div></div><div><div class="label">Entries</div><div class="value">${filtered.length}</div></div><div><div class="label">Statement Period</div><div class="value">${escapeHtml(statementPeriod)}</div></div><div><div class="label">Generated On</div><div class="value">${escapeHtml(generatedOn)}</div></div><div><div class="label">Generated By</div><div class="value">${escapeHtml(generatedBy)}</div></div></div>
      <div class="section"><div class="section-title">Gate Entries</div><table><colgroup><col style="width:10%"><col style="width:9%"><col style="width:6%"><col style="width:5%"><col style="width:13%"><col style="width:6%"><col style="width:11%"><col style="width:16%"><col style="width:15%"><col style="width:9%"></colgroup>
      <thead><tr><th>Entry No.</th><th>Date & Time</th><th>Gate No.</th><th>Type</th><th>Item</th><th>Quantity</th><th>Vendor</th><th>Movement</th><th>Reference / Purpose</th><th>GRN No.</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="section"><div class="section-title">Register Summary</div><div class="summary"><div><div class="label">Total Entries</div><div class="value">${filtered.length}</div></div><div><div class="label">Inward Entries</div><div class="value">${inwardCount}</div></div><div><div class="label">Outward Entries</div><div class="value">${outwardCount}</div></div><div><div class="label">Site Entries</div><div class="value">${siteCount}</div></div></div></div>
      <div class="footer"><span>System-generated Gate Entry Register</span><span>Report ID: ${escapeHtml(reportId)}</span><span>Page 1 of 1</span></div>
    </div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`);
    popup.document.close();
  };

  return (
    <div className="min-h-screen animate-in space-y-6 bg-slate-50/70 p-4 font-sans duration-300 fade-in sm:p-6 lg:p-8">

      {/* ── Page Header ── */}
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-[#0D3A35] p-3.5 text-white shadow-[0_12px_28px_-12px_rgba(13,58,53,0.75)]">
            <DoorOpen className="h-7 w-7" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0D3A35]">Inventory Operations</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Gate Entry Management</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Log every inward and outward movement through the gate.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          {activeTab === 'gate-entry' && (
            <button
              type="button"
              onClick={printGateEntries}
              className="inline-flex items-center gap-2 rounded-xl border border-[#0D3A35]/15 bg-white px-4 py-2.5 text-sm font-semibold text-[#0D3A35] shadow-sm transition hover:bg-[#0D3A35]/5"
            >
              <Printer className="h-4 w-4" />
              Print Gate Entries
            </button>
          )}
          <button
            type="button"
            onClick={() => { setEditingEntry(null); setIsModalOpen(true); }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0D3A35] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(13,58,53,0.9)] transition hover:bg-[#092e2a]"
          >
            <Plus className="w-4 h-4" />
            New Gate Entry
          </button>
        </div>
      </div>

      {/* ── Module switch bar ── */}
      <div className="overflow-x-auto border-b border-slate-200 bg-white px-1">
        <div className="flex min-w-max items-center gap-10 px-4">
          {[
            { key: 'gate-entry' as const, label: 'Gate Entry', icon: DoorOpen },
            { key: 'configure' as const, label: 'Configure', icon: Settings },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'relative flex h-14 items-center gap-2 px-1 text-sm font-bold transition-colors',
                  isActive ? 'text-slate-950' : 'text-slate-500 hover:text-[#0D3A35]',
                )}
              >
                <TabIcon className={cn('h-4 w-4', isActive && 'text-[#0D3A35]')} />
                {tab.label}
                {isActive && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#0D3A35]" />}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'gate-entry' && (
        <>
      {/* ── Register ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Gate Entry Register</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {filtered.length} of {entries.length} entries shown
              {(periodFrom || periodTo) && ` · ${periodFrom ? formatDateDDMMYYYY(periodFrom) : 'Beginning'} to ${periodTo ? formatDateDDMMYYYY(periodTo) : 'Present'}`}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end xl:w-auto">
            <div className="relative w-full sm:w-auto">
              <label className={fieldLabelCls}>Period</label>
              <button
                type="button"
                onClick={openPeriodPicker}
                className={cn(
                  'flex h-11 w-full min-w-48 items-center justify-between gap-3 rounded-xl border bg-white px-3.5 text-sm font-semibold shadow-sm transition sm:w-auto',
                  periodPickerOpen ? 'border-[#0D3A35] ring-2 ring-[#0D3A35]/10' : 'border-slate-200 text-slate-700 hover:border-[#0D3A35]/40',
                )}
              >
                <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4 text-[#0D3A35]" /> Select Period</span>
                {(periodFrom || periodTo) && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
              </button>

              {periodPickerOpen && (
                <div className="absolute left-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_50px_-18px_rgba(15,23,42,0.35)]">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Select Statement Period</p>
                      <p className="mt-0.5 text-xs text-slate-500">Filters both the register and printed report.</p>
                    </div>
                    <button type="button" onClick={() => setPeriodPickerOpen(false)} aria-label="Close period selector" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={fieldLabelCls}>From Date</label>
                      <input type="date" value={draftPeriodFrom} max={draftPeriodTo || undefined} onChange={(event) => setDraftPeriodFrom(event.target.value)} className={textInputCls} />
                    </div>
                    <div>
                      <label className={fieldLabelCls}>To Date</label>
                      <input type="date" value={draftPeriodTo} min={draftPeriodFrom || undefined} onChange={(event) => setDraftPeriodTo(event.target.value)} className={textInputCls} />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                    <button type="button" onClick={() => { setDraftPeriodFrom(''); setDraftPeriodTo(''); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Clear</button>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPeriodPickerOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                      <button type="button" onClick={applyPeriod} className="rounded-lg bg-[#0D3A35] px-3 py-2 text-xs font-semibold text-white hover:bg-[#092e2a]">Apply Period</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="relative w-full sm:w-72">
              <label className={fieldLabelCls}>Search</label>
              <Search className="pointer-events-none absolute bottom-3.5 left-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Entry no, item, vendor, reference…"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#0D3A35] focus:bg-white focus:ring-2 focus:ring-[#0D3A35]/10"
              />
            </div>
          </div>
        </div>

        {isLoadingEntries ? (
          <div className="flex flex-col gap-3 p-5">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <DoorOpen className="h-8 w-8 text-[#0D3A35]/45" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">No gate entries found</p>
              <p className="text-xs text-slate-400 mt-1">Click "New Gate Entry" to log the first movement.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0D3A35] text-white">
                <tr>
                  {['Entry No.', 'Date & Time', 'Gate No.', 'Type', 'Item', 'Vendor', 'Movement', 'Reference', 'GRN No.', 'Action'].map((heading) => (
                    <th key={heading} className={cn('whitespace-nowrap px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/85', heading === 'Reference' ? 'text-left' : 'text-center')}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => {
                  const linkedGrn = grnByGateEntry.get(e.enteryId);
                  const destination = e.destinationName ? e : entryMetadata[e.enteryId];
                  const savedItem = entryMetadata[e.enteryId];
                  const entryItem = e.itemName ? e : savedItem;
                  const displayEntryNo = e.siteEntryNo || savedItem?.siteEntryNo || e.enteryId;
                  const outwardDetails = e.outwardToName ? e : savedItem;
                  return (
                  <tr key={e.enteryId} className="transition hover:bg-emerald-50/40">
                    <td className="whitespace-nowrap px-4 py-4 text-center font-mono text-xs font-semibold text-[#0D3A35]">{displayEntryNo}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-center text-xs text-slate-600">{formatDateTime(e.entryDate, e.entryTime)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-center font-medium text-slate-700">{destination?.destinationType === 'Site' ? '—' : e.gateNo}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border whitespace-nowrap',
                        e.entryType === 'Inward'
                          ? 'bg-green-100 text-green-700 border-green-200'
                          : 'bg-orange-100 text-orange-700 border-orange-200',
                      )}>
                        {e.entryType === 'Inward' ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                        {e.entryType}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {entryItem?.itemName ? (
                        <div className="mx-auto max-w-[220px] text-xs">
                          <p className="font-semibold text-slate-700">{entryItem.itemName}</p>
                          {(entryItem.itemCode || entryItem.itemUnit) && (
                            <p className="mt-0.5 text-[10px] text-slate-400">{[entryItem.itemCode, entryItem.itemUnit].filter(Boolean).join(' · ')}</p>
                          )}
                          {entryItem.itemQuantity != null && (
                            <p className="mt-1 font-semibold text-[#0D3A35]">{entryItem.itemQuantity.toLocaleString('en-IN')} {entryItem.itemUnit || ''}</p>
                          )}
                        </div>
                      ) : linkedGrn?.items.length ? (
                        <div className="mx-auto flex max-w-[220px] flex-col gap-0.5 text-xs text-slate-700">
                          {linkedGrn.items.map((item, index) => (
                            <span key={`${item.itemId}-${index}`} className="font-medium">
                              {item.description || item.itemCode || 'Not Recorded'}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not Recorded</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1.5 font-medium text-slate-700">
                        <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        {e.vendorName}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {e.entryType === 'Outward' && outwardDetails?.outwardToName ? (
                        <div className="inline-flex items-start gap-2 text-left">
                          <ArrowUpFromLine className="h-4 w-4 shrink-0 text-amber-600" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">From</p>
                            <p className="text-xs font-semibold text-slate-700">{destination?.destinationName || 'Not Recorded'}</p>
                            <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">To · {outwardDetails.outwardToType || 'Recipient'}</p>
                            <p className="text-xs font-semibold text-slate-700">{outwardDetails.outwardToName}</p>
                          </div>
                        </div>
                      ) : destination?.destinationName ? (
                        <div className="inline-flex items-center gap-2 text-left">
                          {destination.destinationType === 'Site' ? <MapPin className="h-4 w-4 shrink-0 text-amber-600" /> : <Warehouse className="h-4 w-4 shrink-0 text-[#0D3A35]" />}
                          <div>
                            <p className="text-xs font-semibold text-slate-700">{destination.destinationName}</p>
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">{destination.destinationType}</p>
                          </div>
                        </div>
                      ) : <span className="text-xs text-slate-400">Not Recorded</span>}
                    </td>
                    <td className="px-4 py-4 text-left text-xs text-slate-500">
                      {e.entryType === 'Inward' ? (
                        <div className="flex flex-col items-start gap-0.5">
                          {e.orderNumber && <span>Order: {e.orderNumber}</span>}
                          {e.invoiceNumber && <span>Invoice: {e.invoiceNumber}</span>}
                          {e.challanNumber && <span>Challan: {e.challanNumber}</span>}
                          {e.lrNumber && <span>LR: {e.lrNumber}</span>}
                          {e.ewayBillNumber && <span>E-way: {e.ewayBillNumber}</span>}
                          {!e.orderNumber && !e.invoiceNumber && !e.challanNumber && !e.lrNumber && !e.ewayBillNumber && '—'}
                        </div>
                      ) : (
                        <div className="flex flex-col items-start gap-0.5">
                          {outwardDetails?.outwardPurpose ? <span>Purpose: {outwardDetails.outwardPurpose}</span> : '—'}
                          {outwardDetails?.outwardContactPerson && <span>Contact: {outwardDetails.outwardContactPerson}</span>}
                          {outwardDetails?.outwardMobile && <span>Mobile: {outwardDetails.outwardMobile}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.usedInGrn || linkedGrn?.grnNo ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 whitespace-nowrap">
                          {e.usedInGrn || linkedGrn?.grnNo}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-slate-400">
                          Not Generated
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setIsModalOpen(false); setEditingEntry(e); }}
                          title="Edit entry"
                          aria-label={`Edit ${displayEntryNo}`}
                          className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-[#0D3A35]/30 hover:bg-emerald-50 hover:text-[#0D3A35]"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteEntry(e)}
                          title="Delete entry"
                          aria-label={`Delete ${displayEntryNo}`}
                          className="rounded-xl border border-red-100 bg-white p-2 text-red-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {activeTab === 'configure' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)]">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-emerald-50 p-3 text-[#0D3A35] ring-1 ring-emerald-100">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Gate Entry Configuration</h2>
                <p className="mt-1 text-sm text-slate-500">Current gate-entry controls and system behaviour.</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Registered Gates', value: configuredGates.length || 'None', detail: configuredGates.join(', ') || 'Created from gate entries', icon: DoorOpen },
                { label: 'Entry Numbering', value: 'Automatic', detail: 'Generated when an entry is saved', icon: Hash },
                { label: 'GRN Linkage', value: 'Enabled', detail: 'GRN number linked after creation', icon: ClipboardCheck },
                { label: 'Data Refresh', value: 'Automatic', detail: 'Every 30 seconds and on window focus', icon: RefreshCw },
              ].map((setting) => (
                <div key={setting.label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                  <setting.icon className="h-5 w-5 text-[#0D3A35]" />
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{setting.label}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{setting.value}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{setting.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)]">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-50 p-2.5 text-[#0D3A35]"><Plus className="h-5 w-5" /></div>
                <div>
                  <h3 className="font-semibold text-slate-900">Create Gate</h3>
                  <p className="text-xs text-slate-500">Assign a gate to an inventory store or delivery site.</p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className={fieldLabelCls}>Location Type</label>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
                    {(['Store', 'Site'] as DestinationType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setGateForm((previous) => ({ ...previous, locationType: type, clusterId: '', locationId: '' }))}
                        className={cn('rounded-lg px-3 py-2.5 text-sm font-semibold transition', gateForm.locationType === type ? 'bg-white text-[#0D3A35] shadow-sm' : 'text-slate-500')}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                {gateForm.locationType === 'Site' && (
                  <div>
                    <label className={fieldLabelCls}>Cluster</label>
                    <div className="relative">
                      <select
                        value={gateForm.clusterId}
                        onChange={(event) => setGateForm((previous) => ({ ...previous, clusterId: event.target.value, locationId: '' }))}
                        disabled={isLoadingLandParcels}
                        className={selectCls}
                      >
                        <option value="">{isLoadingLandParcels ? 'Loading clusters…' : 'Select cluster'}</option>
                        {clusters.map((cluster) => <option key={cluster.id} value={cluster.id}>{cluster.name}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </div>
                  </div>
                )}
                <div>
                  <label className={fieldLabelCls}>{gateForm.locationType === 'Site' ? 'Land Parcel' : 'Store'}</label>
                  <div className="relative">
                    <select
                      value={gateForm.locationId}
                      onChange={(event) => setGateForm((previous) => ({ ...previous, locationId: event.target.value }))}
                      disabled={gateForm.locationType === 'Site' && (!gateForm.clusterId || isLoadingLandParcels)}
                      className={selectCls}
                    >
                      <option value="">{gateForm.locationType === 'Site' ? (gateForm.clusterId ? 'Select land parcel' : 'Select cluster first') : 'Select store'}</option>
                      {(gateForm.locationType === 'Store'
                        ? stores.map((name) => ({ id: name, name, detail: 'Store' }))
                        : landParcels.filter((parcel) => parcel.clusterId === gateForm.clusterId).map((parcel) => ({ id: parcel.id, name: `${parcel.id} — ${parcel.ownerName || 'Owner not recorded'}`, detail: parcel.detail || 'Land Parcel' })))
                        .map((location) => <option key={location.id} value={location.id}>{location.name} · {location.detail}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className={fieldLabelCls}>Gate Number / Name</label>
                  <input
                    value={gateForm.gateNo}
                    onChange={(event) => setGateForm((previous) => ({ ...previous, gateNo: event.target.value }))}
                    onKeyDown={(event) => { if (event.key === 'Enter') addGate(); }}
                    placeholder="e.g. Main Gate, Gate 2"
                    className={textInputCls}
                  />
                </div>
                <button type="button" onClick={addGate} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0D3A35] px-4 text-sm font-semibold text-white transition hover:bg-[#092e2a]">
                  <Plus className="h-4 w-4" /> Create Gate
                </button>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)]">
              <div className="border-b border-slate-200 px-6 py-5">
                <h3 className="font-semibold text-slate-900">Configured Gates</h3>
                <p className="mt-1 text-xs text-slate-500">{gates.length} gate assignment{gates.length === 1 ? '' : 's'}</p>
              </div>
              {gates.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center p-6 text-center">
                  <DoorOpen className="h-9 w-9 text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-600">No gates configured</p>
                  <p className="mt-1 text-xs text-slate-400">Create the first store or site gate using the form.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {gates.map((gate) => (
                    <div key={gate.id} className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-slate-50">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={cn('rounded-xl p-2.5', gate.locationType === 'Site' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-[#0D3A35]')}>
                          {gate.locationType === 'Site' ? <MapPin className="h-4 w-4" /> : <Warehouse className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800">{gate.gateNo}</p>
                          <p className="truncate text-xs text-slate-500">{gate.locationName} · {gate.locationType}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeGate(gate.id)} aria-label={`Delete ${gate.gateNo}`} className="rounded-xl border border-red-100 p-2.5 text-red-500 transition hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {(isModalOpen || editingEntry) && (
        <NewGateEntryModal
          vendors={vendors}
          isLoadingVendors={isLoadingVendors}
          vendorPos={vendorPos}
          isLoadingPos={isLoadingPos}
          gates={gates}
          stores={stores}
          clusters={clusters}
          landParcels={landParcels}
          editingEntry={editingEntry}
          onClose={() => { setIsModalOpen(false); setEditingEntry(null); }}
          onCreated={() => { void refresh(true); }}
        />
      )}

      {deleteEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_28px_80px_-24px_rgba(2,44,39,0.55)]">
            <div className="flex items-center justify-between bg-[#0D3A35] px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white/10 p-2"><Trash2 className="h-5 w-5" /></div>
                <div><h3 className="font-semibold">Delete Gate Entry</h3><p className="text-xs text-white/70">This entry will be removed from the register.</p></div>
              </div>
              <button type="button" onClick={() => setDeleteEntry(null)} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5">
              <p className="text-sm leading-6 text-slate-600">
                Delete <strong className="text-slate-900">{deleteEntry.siteEntryNo || deleteEntry.enteryId}</strong>? This action cannot be undone from this screen.
              </p>
              {(deleteEntry.usedInGrn || grnByGateEntry.get(deleteEntry.enteryId)?.grnNo) && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  This entry is linked to GRN {deleteEntry.usedInGrn || grnByGateEntry.get(deleteEntry.enteryId)?.grnNo}. Verify the accounting impact before deleting it.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setDeleteEntry(null)} disabled={deletingEntry} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => { void confirmDeleteEntry(); }} disabled={deletingEntry} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                {deletingEntry ? 'Deleting…' : 'Delete Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GateEntryModule;
