import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, FileCheck, IndianRupee, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import WccModal from '@/components/cultivation/WccModal';
import type { TimelineFarm } from '@/components/cultivation/TaskTimelinePanel';

const BASE_URL = getBaseUrl().replace(/\/$/, '');

type LatLng = [number, number];

// The farm shape this flow needs — a superset of TimelineFarm (map thumbnails) plus
// farmer_id (used to resolve farmer_name for the vendor's scope-of-work cards).
export type WccCreateFlowFarm = TimelineFarm & { farmer_id?: string };

// Shape returned by /admin_cultivation/get_active_vendor
type ApiActiveVendor = { vendor_id: string; vendor_name: string; vendor_contact?: string; order_number?: string };

type ActiveVendor = {
  vendor_id: string;
  vendor_name: string;
  contact?: string;
  email?: string;
  category?: string;
  constitution?: string;
  gst?: string;
  pan?: string;
  address?: string;
  active_orders: string[];
};

type WorkOrderPreview = {
  orderNumber: string;
  orderDate: string;
  completionDate: string;
  requestNumber: string;
  comparisonId: string;
  project: string;
  subject: string;
  paymentTerms: string;
  status: string;
  items: Array<{ name: string; uom: string; quantity: number; unitRate: number }>;
  totalValue: number;
};

const textValue = (value: unknown) => String(value ?? '').trim();

const vendorAddress = (details: Record<string, unknown>) => {
  if (textValue(details.vendor_address)) return textValue(details.vendor_address);
  const address = details.address && typeof details.address === 'object' ? details.address as Record<string, unknown> : {};
  return [
    address.plot_flat_unit_no_and_floor,
    address.name_of_premises,
    address.road,
    address.taluka_locality,
    address.district,
    address.state,
    address.pin_code,
  ].map(textValue).filter(Boolean).join(', ');
};

const workOrderPreview = (order: Record<string, unknown>): WorkOrderPreview | null => {
  const quote = order.purchase_quote && typeof order.purchase_quote === 'object' ? order.purchase_quote as Record<string, unknown> : {};
  const approval = order.director_approval && typeof order.director_approval === 'object' ? order.director_approval as Record<string, unknown> : {};
  const orderNumber = textValue(order.order_number ?? quote.order_number ?? quote.poNo ?? quote.po_no);
  if (!orderNumber) return null;
  const rawItems = Array.isArray(order.item_details)
    ? order.item_details
    : Array.isArray(quote.order_lines) ? quote.order_lines : [];
  const items = (rawItems as Record<string, unknown>[]).map((item) => ({
    name: textValue(item.name ?? item.partName) || 'Service not recorded',
    uom: textValue(item.uom),
    quantity: Number(item.quantity ?? item.qty) || 0,
    unitRate: Number(item.unit_rate ?? item.unitRate) || 0,
  }));
  const itemTotal = items.reduce((sum, item) => sum + item.quantity * item.unitRate, 0);
  const rawCharges = Array.isArray(order.order_charges) ? order.order_charges : Array.isArray(quote.order_charges) ? quote.order_charges : [];
  const charges = (rawCharges as Record<string, unknown>[]).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return {
    orderNumber,
    orderDate: textValue(quote.poDate ?? order.created_at),
    completionDate: textValue(quote.deliveryDate),
    requestNumber: textValue(order.pr_number ?? quote.pr_number),
    comparisonId: textValue(order.comparison_id ?? quote.comparison_id),
    project: textValue(quote.coverProject ?? quote.clusterName ?? quote.clusterId),
    subject: textValue(quote.coverSubject),
    paymentTerms: textValue(quote.paymentTerms),
    status: textValue(approval.status) || 'active',
    items,
    totalValue: itemTotal + charges,
  };
};

const compactDate = (value: string) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const compactMoney = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2,
}).format(value);

// Shape of each plot within a land, as returned by /admin_cultivation/get_scope_of_work_for_vendor
type ApiPlot = { plot_id: string; plot_name: string; crop_type: string; plot_area: number; plot_coordinates: LatLng[]; created_at?: string };

type ApiScopeItem = {
  land_id: string;
  farmer_id: string;
  farmer_name?: string;
  block_id: string;
  crop_type?: string | null;
  land_mapping?: LatLng[];
  total_area?: number;
  plots?: ApiPlot[];
  vendor_scope?: { activities?: string[]; start_date?: string; end_date?: string };
};

// Shape of each item returned by /admin_cultivation/get_scope_of_work_for_vendor
type ScopeItem = {
  land_id: string;
  farmer_id: string;
  farmer_name?: string;
  block_id: string;
  crop_type: string | null;
  land_mapping: LatLng[];
  total_area: number;
  plots: ApiPlot[];
  activities: string[];
  start_date?: string;
  end_date?: string;
};

type Props = {
  farms: WccCreateFlowFarm[];
  onClose: () => void;
};

// Reuses the exact vendor -> scope-of-work -> WccModal flow already proven out on the
// Scope of Work page — this is the WCC module's own entry point for it, so "Create WCC"
// no longer needs to happen from Scope of Work.
export default function WccCreateFlow({ farms, onClose }: Props) {
  const [vendors, setVendors] = useState<ActiveVendor[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [vendorSearch, setVendorSearch] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedWoNumber, setSelectedWoNumber] = useState<string | null>(null);
  const [workOrderPreviews, setWorkOrderPreviews] = useState<Record<string, WorkOrderPreview>>({});
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [isLoadingScope, setIsLoadingScope] = useState(false);
  const [farmerNames, setFarmerNames] = useState<Record<string, string>>({});
  const [operationalDateRange, setOperationalDateRange] = useState<{ start?: string; end?: string }>({});
  const [isLoadingOperationalRange, setIsLoadingOperationalRange] = useState(false);

  // --- Fetch vendors, then retain only those with at least one active Work Order ---
  useEffect(() => {
    let mounted = true;
    setIsLoadingVendors(true);
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/admin_cultivation/get_active_vendor`);
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (data?.success && Array.isArray(data?.vendors)) {
          let directoryById = new Map<string, Record<string, unknown>>();
          try {
            const loadDirectory = (method: 'GET' | 'POST') => fetch(`${BASE_URL}/purchase_flow/get_vendors_raw`, {
              method,
              headers: { Accept: 'application/json' },
            });
            let directoryResponse = await loadDirectory('GET');
            if (directoryResponse.status === 405) directoryResponse = await loadDirectory('POST');
            const directoryData = directoryResponse.ok ? await directoryResponse.json().catch(() => null) : null;
            const directoryRows: Record<string, unknown>[] = Array.isArray(directoryData?.vendors) ? directoryData.vendors : [];
            directoryById = new Map(directoryRows.map((row) => [textValue(row.vendor_id ?? row.id), row]));
          } catch {
            directoryById = new Map();
          }
          const seen = new Set<string>();
          const candidates: ActiveVendor[] = [];
          for (const v of data.vendors as ApiActiveVendor[]) {
            if (!v?.vendor_id || seen.has(v.vendor_id)) continue;
            seen.add(v.vendor_id);
            const directory = directoryById.get(v.vendor_id) ?? {};
            const details = directory.vendor_details && typeof directory.vendor_details === 'object'
              ? directory.vendor_details as Record<string, unknown>
              : directory;
            candidates.push({
              vendor_id: v.vendor_id,
              vendor_name: textValue(details.vendor_name) || v.vendor_name || v.vendor_id,
              contact: textValue(details.vendor_contact) || v.vendor_contact,
              email: textValue(details.e_mail_id ?? details.email),
              category: textValue(details.nature_of_vendor),
              constitution: textValue(details.legal_constitution ?? details.vendor_entity_type),
              gst: textValue(details.gst_number ?? details.gstin),
              pan: textValue(details.income_tax_pan ?? details.pan_number ?? details.pan),
              address: vendorAddress(details),
              active_orders: [],
            });
          }
          const eligible = await Promise.all(candidates.map(async (vendor): Promise<ActiveVendor | null> => {
            try {
              const orderRes = await fetch(`${BASE_URL}/admin_wcc_certificate/get_active_vendor_orders/${vendor.vendor_id}`);
              const orderData = await orderRes.json().catch(() => null) as { success?: boolean; active_orders?: string[] } | null;
              const activeOrders = orderData?.success && Array.isArray(orderData.active_orders)
                ? orderData.active_orders.filter((order): order is string => typeof order === 'string' && order.trim().length > 0)
                : [];
              if (!activeOrders.length) return null;
              return { ...vendor, active_orders: activeOrders };
            } catch {
              return null;
            }
          }));
          if (mounted) setVendors(eligible.filter((vendor): vendor is ActiveVendor => vendor !== null));
        } else {
          setVendors([]);
        }
      } catch {
        if (mounted) setVendors([]);
      } finally {
        if (mounted) setIsLoadingVendors(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load the same saved WO records used by Work Order Flow, then present their key
  // document details in the order chooser cards.
  useEffect(() => {
    let mounted = true;
    fetch(`${BASE_URL}/purchase_flow/get_all_purchase_orders`, { headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!mounted) return;
        const orders: Record<string, unknown>[] = Array.isArray(data?.purchase_orders) ? data.purchase_orders : [];
        const previews: Record<string, WorkOrderPreview> = {};
        for (const order of orders) {
          if (textValue(order.order_type) && textValue(order.order_type) !== 'SPR') continue;
          const preview = workOrderPreview(order);
          if (preview) previews[preview.orderNumber] = preview;
        }
        setWorkOrderPreviews(previews);
      })
      .catch(() => { if (mounted) setWorkOrderPreviews({}); });
    return () => { mounted = false; };
  }, []);

  // --- Fetch scope of work for selected vendor ---
  useEffect(() => {
    if (!selectedVendorId || !selectedWoNumber) {
      setScopeItems([]);
      return;
    }
    let mounted = true;
    setIsLoadingScope(true);
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/admin_cultivation/get_scope_of_work_for_vendor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendor_id: selectedVendorId, order_number: selectedWoNumber }),
        });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (data?.success && Array.isArray(data.scope_of_work)) {
          const items: ScopeItem[] = (data.scope_of_work as ApiScopeItem[]).map((s) => {
            const vs = s.vendor_scope ?? {};
            return {
              land_id: s.land_id,
              farmer_id: s.farmer_id,
              farmer_name: s.farmer_name,
              block_id: s.block_id,
              crop_type: s.crop_type ?? null,
              land_mapping: Array.isArray(s.land_mapping) ? s.land_mapping : [],
              total_area: Number(s.total_area) || 0,
              plots: Array.isArray(s.plots) ? s.plots : [],
              activities: vs.activities ?? [],
              start_date: vs.start_date,
              end_date: vs.end_date,
            };
          });
          setScopeItems(items);
        } else {
          setScopeItems([]);
        }
      } catch {
        if (mounted) setScopeItems([]);
      } finally {
        if (mounted) setIsLoadingScope(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedVendorId, selectedWoNumber]);

  // --- Discover the selected vendor's actual operational (non-cultivation) task date span ---
  // A pure operational vendor (e.g. a borewell driller with no land scope) has no scope
  // start/end dates to seed WccModal's default range with, so it would otherwise fall back to
  // "last 30 days" and silently hide real tasks dated outside that window. Query without a
  // narrow date filter (a wide open window) so nothing gets excluded here, then use the
  // resulting min/max as part of the default range instead.
  useEffect(() => {
    if (!selectedVendorId || !selectedWoNumber) {
      setOperationalDateRange({});
      return;
    }
    let mounted = true;
    setIsLoadingOperationalRange(true);
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/admin_cultivation/get_operational_work_done_by_vendor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendor_id: selectedVendorId, order_number: selectedWoNumber, start_date: '2000-01-01', end_date: '2100-12-31' }),
        });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        const entries: Array<{ from_date?: string; to_date?: string; order_number?: string }> = data?.success && Array.isArray(data.work_done)
          ? data.work_done.filter((entry: { order_number?: string }) => !entry.order_number || entry.order_number === selectedWoNumber)
          : [];
        const starts = entries.map((e) => e.from_date).filter((d): d is string => !!d);
        const ends = entries.map((e) => e.to_date).filter((d): d is string => !!d);
        setOperationalDateRange({
          start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : undefined,
          end: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : undefined,
        });
      } catch {
        if (mounted) setOperationalDateRange({});
      } finally {
        if (mounted) setIsLoadingOperationalRange(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedVendorId, selectedWoNumber]);

  // --- Fetch farmer names for whichever farms show up in the selected vendor's scope ---
  useEffect(() => {
    const ids = scopeItems.map((s) => s.land_id).filter((id) => id && !farmerNames[id]);
    if (!ids.length) return;
    let mounted = true;
    (async () => {
      const results = await Promise.all(ids.map(async (id) => {
        try {
          const res = await fetch(`${BASE_URL}/farmer_managment/get_farmer_details_from_farm_id/${id}`);
          if (!res.ok) return { id, name: id };
          const d = await res.json().catch(() => null);
          const name = d?.farmer?.farmer_name;
          return { id, name: typeof name === 'string' && name.trim() ? name.trim() : id };
        } catch { return { id, name: id }; }
      }));
      if (!mounted) return;
      setFarmerNames((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.id] = r.name;
        return next;
      });
    })();
    return () => { mounted = false; };
  }, [scopeItems, farmerNames]);

  const selectedVendor = useMemo(
    () => vendors.find((v) => v.vendor_id === selectedVendorId) ?? null,
    [vendors, selectedVendorId],
  );

  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      [v.vendor_name, v.vendor_id, v.contact, v.email, v.category, v.constitution, v.gst, v.pan, v.address]
        .some((value) => (value ?? '').toLowerCase().includes(q)) || v.active_orders.some((order) => order.toLowerCase().includes(q)),
    );
  }, [vendors, vendorSearch]);

  const farmsById = useMemo(() => {
    const map: Record<string, WccCreateFlowFarm> = {};
    for (const f of farms) map[f.farm_id] = f;
    return map;
  }, [farms]);

  const vendorScopeActivities = useMemo(() => {
    const set = new Set<string>();
    for (const item of scopeItems) for (const act of item.activities) set.add(act);
    return Array.from(set);
  }, [scopeItems]);

  // Combines the vendor's cultivation scope dates with their actual operational-task date
  // span, so the default range covers both regardless of which kind of work (or both) this
  // vendor does — a pure operational vendor still gets a real range instead of "no scope dates".
  const vendorScopeDateRange = useMemo(() => {
    const starts = [
      ...scopeItems.map((i) => i.start_date),
      operationalDateRange.start,
    ].filter((d): d is string => !!d);
    const ends = [
      ...scopeItems.map((i) => i.end_date),
      operationalDateRange.end,
    ].filter((d): d is string => !!d);
    return {
      start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : undefined,
      end: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : undefined,
    };
  }, [scopeItems, operationalDateRange]);

  const isLoadingVendorDetail = isLoadingScope || isLoadingOperationalRange;

  // Once a vendor is picked, advance the same centered Create WCC dialog to the
  // task/date/generate step —
  // but only once both its scope-of-work AND operational-task date span have actually
  // finished loading. WccModal seeds its date range from defaultStartDate/defaultEndDate via
  // a one-time useState initializer, so mounting it before those are ready would permanently
  // lock it onto the fallback "last 30 days" window instead of the vendor's real work dates —
  // hiding genuine tasks outside that window (especially for vendors with no land scope at all).
  if (selectedVendor && selectedWoNumber && !isLoadingVendorDetail) {
    return (
      <WccModal
        vendorId={selectedVendor.vendor_id}
        vendorName={selectedVendor.vendor_name}
        vendorWoNumber={selectedWoNumber}
        landIds={scopeItems.map((item) => item.land_id)}
        activities={vendorScopeActivities}
        farmsById={farmsById}
        farmerNames={farmerNames}
        scopeItems={scopeItems}
        defaultStartDate={vendorScopeDateRange.start}
        defaultEndDate={vendorScopeDateRange.end}
        onBack={() => setSelectedWoNumber(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className={cn('flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl', selectedVendor ? 'max-w-[1280px]' : 'max-w-[1380px]')}>
        <div className="flex shrink-0 items-center justify-between border-b border-[#0D3A35] bg-[#0D3A35] px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              {selectedVendor && (
                <button type="button" onClick={() => { setSelectedVendorId(null); setSelectedWoNumber(null); }} className="grid h-8 w-8 place-items-center rounded-lg border border-white/15 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Back to vendor selection">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div>
                <h3 className="text-base font-bold text-white">Create WCC</h3>
                <p className="mt-0.5 text-xs text-emerald-100">{selectedVendor ? `Select an active Work Order for ${selectedVendor.vendor_name}` : 'Select a vendor to continue'}</p>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-white/10">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {!selectedVendor && <div className="shrink-0 border-b border-slate-200 bg-slate-50/70 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              placeholder="Search vendor or WO…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </div>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {selectedVendor ? (
            <div className="space-y-4 bg-slate-50/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Selected Vendor</p><p className="mt-1 text-sm font-bold text-slate-800">{selectedVendor.vendor_name}</p></div>
                <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[10px] font-bold text-emerald-700">{selectedVendor.active_orders.length} Active WO{selectedVendor.active_orders.length === 1 ? '' : 's'}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[...selectedVendor.active_orders]
                  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
                  .map((order) => {
                  const preview = workOrderPreviews[order];
                  const visibleItems = preview?.items.slice(0, 3) ?? [];
                  const isSelecting = isLoadingVendorDetail && selectedWoNumber === order;
                  return (
                    <article key={order} className="flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#0D3A35]/30 hover:shadow-md">
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf4f1] text-[#0D3A35]"><FileCheck className="h-5 w-5" /></span>
                          <div className="min-w-0"><p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Active Work Order</p><p className="mt-1 break-all font-mono text-xs font-bold text-[#0D3A35]">{order}</p></div>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase text-emerald-700">{preview?.status === 'approved' ? 'Approved' : 'Active'}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
                        {[
                          ['WO Date', compactDate(preview?.orderDate ?? '')],
                          ['Completion', compactDate(preview?.completionDate ?? '')],
                          ['SR Number', preview?.requestNumber || '—'],
                          ['Comparison ID', preview?.comparisonId || '—'],
                          ['Project / Cluster', preview?.project || '—'],
                          ['Payment Terms', preview?.paymentTerms || '—'],
                        ].map(([label, value]) => <div key={label} className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p><p className="mt-0.5 truncate text-[11px] font-semibold text-slate-700" title={value}>{value}</p></div>)}
                      </div>

                      <div className="mx-4 flex-1 overflow-hidden rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between bg-slate-50 px-3 py-2"><p className="text-[9px] font-extrabold uppercase tracking-wider text-[#0D3A35]">Service Details</p><span className="rounded-full bg-[#e7f3ef] px-2 py-0.5 text-[9px] font-bold text-[#0D3A35]">{preview?.items.length ?? 0}</span></div>
                        {visibleItems.length ? <div className="divide-y divide-slate-100">{visibleItems.map((item, index) => <div key={`${item.name}-${index}`} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2"><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-slate-700">{item.name}</p><p className="mt-0.5 text-[9px] text-slate-400">{item.uom || 'UOM not recorded'}</p></div><p className="text-right text-[10px] font-bold tabular-nums text-slate-600">{item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p></div>)}</div> : <p className="px-3 py-5 text-center text-[10px] text-slate-400">Service details are not recorded.</p>}
                        {(preview?.items.length ?? 0) > 3 && <p className="border-t border-slate-100 px-3 py-1.5 text-center text-[9px] font-semibold text-slate-400">+{(preview?.items.length ?? 0) - 3} more services</p>}
                      </div>

                      {preview?.subject && <p className="mx-4 mt-3 line-clamp-2 text-[10px] leading-4 text-slate-500">{preview.subject}</p>}
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 bg-[#f7faf9] px-4 py-3">
                        <div><p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400"><IndianRupee className="h-3 w-3" /> WO Value</p><p className="mt-1 text-sm font-black tabular-nums text-slate-900">{preview ? compactMoney(preview.totalValue) : '—'}</p></div>
                        <button
                          type="button"
                          disabled={isSelecting}
                          onClick={() => { setIsLoadingScope(true); setIsLoadingOperationalRange(true); setSelectedWoNumber(order); }}
                          className="rounded-xl bg-[#0D3A35] px-4 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-[#092e2a] disabled:opacity-60"
                        >{isSelecting ? 'Loading…' : 'Select WO'}</button>
                      </div>
                    </article>
                  );
                  })}
              </div>
            </div>
          ) : isLoadingVendors ? (
            <div className="flex flex-col gap-3 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse space-y-2 rounded-lg border border-gray-100 p-3">
                  <div className="h-3 w-2/3 rounded bg-gray-100" />
                  <div className="h-2.5 w-1/2 rounded bg-gray-50" />
                </div>
              ))}
            </div>
          ) : filteredVendors.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <Building2 className="h-8 w-8 text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">No active Work Order vendors found</p>
                <p className="mt-1 text-xs text-slate-400">Only vendors with an active Work Order are eligible for WCC creation.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px] border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[#eef5f3] text-[#0D3A35] shadow-[0_1px_0_#dbe5e2]">
                  <tr>
                    {['S. No.', 'Vendor / Firm', 'Vendor Code', 'Category', 'Contact', 'Email', 'GSTIN', 'PAN', 'Address', 'Active WOs', ''].map((heading) => (
                      <th key={heading || 'action'} className={cn('whitespace-nowrap px-3 py-3 text-left text-[10px] font-extrabold uppercase tracking-[0.08em]', heading === 'S. No.' && 'text-center')}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVendors.map((vendor, index) => (
                    <tr key={vendor.vendor_id} className="bg-white align-top transition-colors hover:bg-emerald-50/30">
                      <td className="w-16 px-3 py-3 text-center font-semibold tabular-nums text-slate-500">{index + 1}</td>
                      <td className="max-w-[220px] px-3 py-3"><p className="font-bold text-slate-800">{vendor.vendor_name}</p>{vendor.constitution && <p className="mt-1 text-[10px] text-slate-400">{vendor.constitution}</p>}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono font-semibold text-slate-600">{vendor.vendor_id}</td>
                      <td className="px-3 py-3 text-slate-600">{vendor.category || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{vendor.contact || '—'}</td>
                      <td className="max-w-[180px] break-all px-3 py-3 text-slate-600">{vendor.email || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-600">{vendor.gst || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-600">{vendor.pan || '—'}</td>
                      <td className="max-w-[260px] px-3 py-3 leading-5 text-slate-500">{vendor.address || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3"><span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-bold text-emerald-700"><FileCheck className="h-3 w-3" />{vendor.active_orders.length}</span></td>
                      <td className="px-3 py-3 text-right">
                        <button type="button" onClick={() => { setSelectedVendorId(vendor.vendor_id); setSelectedWoNumber(null); }} className="rounded-lg bg-[#0D3A35] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#092e2a]">Select</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
