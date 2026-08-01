import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import {
  createGateEntry,
  getGateEntries,
  type GateEntryRecord,
  type GateEntryType,
} from '@/lib/grnApi';

type VendorOption = {
  vendor_id: string;
  vendor_name: string;
  firm_name?: string;
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
  vendorId: '',
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
  try {
    const d = new Date(`${date}T${time}`);
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) + ` · ${time}`;
  } catch {
    return `${date} · ${time}`;
  }
};

const textInputCls = 'h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400';

function NewGateEntryModal({
  vendors,
  isLoadingVendors,
  vendorPos,
  isLoadingPos,
  onClose,
  onCreated,
}: {
  vendors: VendorOption[];
  isLoadingVendors: boolean;
  vendorPos: VendorPo[];
  isLoadingPos: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);

  const selectedVendor = vendors.find((v) => v.vendor_id === form.vendorId) ?? null;
  const posForVendor = useMemo(
    () => (form.vendorId ? vendorPos.filter((p) => p.vendorId === form.vendorId) : []),
    [vendorPos, form.vendorId],
  );

  const handleSubmit = async () => {
    if (!form.gateNo.trim()) { toast.error('Please enter the gate number'); return; }
    if (!form.vendorId) { toast.error('Please select a vendor'); return; }

    setSubmitting(true);
    try {
      const { enteryId } = await createGateEntry({
        entryDate: form.entryDate,
        entryTime: form.entryTime,
        gateNo: form.gateNo.trim(),
        entryType: form.entryType,
        vendorId: form.vendorId,
        vendorName: selectedVendor?.firm_name || selectedVendor?.vendor_name || form.vendorId,
        orderNumber: form.orderNumber.trim() || undefined,
        invoiceNumber: form.invoiceNumber.trim() || undefined,
        invoiceDate: form.invoiceDate || undefined,
        challanNumber: form.challanNumber.trim() || undefined,
        challanDate: form.challanDate || undefined,
        lrNumber: form.lrNumber.trim() || undefined,
        lrDate: form.lrDate || undefined,
        ewayBillNumber: form.ewayBillNumber.trim() || undefined,
      });
      toast.success(`${enteryId} logged`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create gate entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white border border-gray-200 w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-indigo-50/60 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800">New Gate Entry</h3>
            <p className="text-xs text-slate-500 mt-0.5">Entry No. is auto-generated on save.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Entry Type toggle */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Entry Type <span className="text-red-500">*</span>
            </label>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden w-full">
              {(['Inward', 'Outward'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, entryType: type }))}
                  className={cn(
                    'flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors select-none',
                    form.entryType === type ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-gray-50',
                  )}
                >
                  {type === 'Inward' ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time + Gate No */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Entry Date</label>
              <input
                type="date"
                value={form.entryDate}
                onChange={(e) => setForm((p) => ({ ...p, entryDate: e.target.value }))}
                className={textInputCls}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">Entry Time</label>
              <input
                type="time"
                value={form.entryTime}
                onChange={(e) => setForm((p) => ({ ...p, entryTime: e.target.value }))}
                className={textInputCls}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Gate No. <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.gateNo}
                onChange={(e) => setForm((p) => ({ ...p, gateNo: e.target.value }))}
                placeholder="Gate 1"
                className={textInputCls}
              />
            </div>
          </div>

          {/* Vendor */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Vendor <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={form.vendorId}
                onChange={(e) => setForm((p) => ({ ...p, vendorId: e.target.value, orderNumber: '' }))}
                disabled={isLoadingVendors}
                className="w-full appearance-none h-9 rounded-lg border border-gray-300 bg-white px-3 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
              >
                <option value="">{isLoadingVendors ? 'Loading vendors…' : 'Select a vendor'}</option>
                {vendors.map((v) => (
                  <option key={v.vendor_id} value={v.vendor_id}>{v.firm_name || v.vendor_name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Reference numbers — Inward only */}
          {form.entryType === 'Inward' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Order Number</label>
                <div className="relative">
                  <select
                    value={form.orderNumber}
                    onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))}
                    disabled={!form.vendorId || isLoadingPos || posForVendor.length === 0}
                    className="w-full appearance-none h-9 rounded-lg border border-gray-300 bg-white px-3 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50 disabled:bg-gray-50"
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
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Invoice Number</label>
                  <input
                    type="text"
                    value={form.invoiceNumber}
                    onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Invoice Date</label>
                  <input
                    type="date"
                    value={form.invoiceDate}
                    onChange={(e) => setForm((p) => ({ ...p, invoiceDate: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Challan Number</label>
                  <input
                    type="text"
                    value={form.challanNumber}
                    onChange={(e) => setForm((p) => ({ ...p, challanNumber: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Challan Date</label>
                  <input
                    type="date"
                    value={form.challanDate}
                    onChange={(e) => setForm((p) => ({ ...p, challanDate: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">LR Number</label>
                  <input
                    type="text"
                    value={form.lrNumber}
                    onChange={(e) => setForm((p) => ({ ...p, lrNumber: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">LR Date</label>
                  <input
                    type="date"
                    value={form.lrDate}
                    onChange={(e) => setForm((p) => ({ ...p, lrDate: e.target.value }))}
                    className={textInputCls}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">E-way Bill Number</label>
                <input
                  type="text"
                  value={form.ewayBillNumber}
                  onChange={(e) => setForm((p) => ({ ...p, ewayBillNumber: e.target.value }))}
                  className={textInputCls}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={cn(
              'px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-colors',
              submitting ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white',
            )}
          >
            {submitting ? 'Saving…' : 'Create Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GateEntryModule() {
  const [entries, setEntries] = useState<GateEntryRecord[]>([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [q, setQ] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(false);
  const [vendorPos, setVendorPos] = useState<VendorPo[]>([]);
  const [isLoadingPos, setIsLoadingPos] = useState(false);

  const refresh = () => {
    setIsLoadingEntries(true);
    getGateEntries()
      .then(setEntries)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load gate entries'))
      .finally(() => setIsLoadingEntries(false));
  };

  useEffect(() => { refresh(); }, []);

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

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((e) => (
      e.enteryId.toLowerCase().includes(query) ||
      e.vendorName.toLowerCase().includes(query) ||
      e.gateNo.toLowerCase().includes(query) ||
      (e.orderNumber || '').toLowerCase().includes(query) ||
      (e.invoiceNumber || '').toLowerCase().includes(query) ||
      (e.ewayBillNumber || '').toLowerCase().includes(query)
    ));
  }, [entries, q]);

  const stats = useMemo(() => {
    const today = nowDate();
    const todayEntries = entries.filter((e) => e.entryDate === today);
    return {
      total: entries.length,
      todayTotal: todayEntries.length,
      todayInward: todayEntries.filter((e) => e.entryType === 'Inward').length,
      todayOutward: todayEntries.filter((e) => e.entryType === 'Outward').length,
    };
  }, [entries]);

  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-300 min-h-screen bg-gray-50/50 font-sans">

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100 shadow-sm">
            <DoorOpen className="w-7 h-7 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Gate Entry</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-lg">
              Log every inward and outward movement through the gate.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-400" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Gate Entry
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Today's Entries", value: stats.todayTotal, icon: Calendar, color: 'indigo' as const },
          { label: "Today's Inward", value: stats.todayInward, icon: ArrowDownToLine, color: 'green' as const },
          { label: "Today's Outward", value: stats.todayOutward, icon: ArrowUpFromLine, color: 'orange' as const },
          { label: 'Total Entries', value: stats.total, icon: Hash, color: 'blue' as const },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-4">
            <div className={cn(
              'p-3 rounded-xl border',
              s.color === 'indigo' && 'bg-indigo-50 border-indigo-100 text-indigo-600',
              s.color === 'green' && 'bg-green-50 border-green-100 text-green-600',
              s.color === 'orange' && 'bg-orange-50 border-orange-100 text-orange-600',
              s.color === 'blue' && 'bg-blue-50 border-blue-100 text-blue-600',
            )}>
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{s.value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Register ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search entry no, vendor, gate, reference…"
              className="w-full pl-8 pr-3 h-9 rounded-lg border border-gray-200 bg-gray-50 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        </div>

        {isLoadingEntries ? (
          <div className="flex flex-col gap-2 p-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
              <DoorOpen className="w-8 h-8 text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">No gate entries yet</p>
              <p className="text-xs text-slate-400 mt-1">Click "New Gate Entry" to log the first movement.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide">Entry No.</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide">Date &amp; Time</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide">Gate No.</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide">Vendor</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide">Reference</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e) => (
                  <tr key={e.enteryId} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{e.enteryId}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(e.entryDate, e.entryTime)}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{e.gateNo}</td>
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
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-medium text-slate-700">
                        <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        {e.vendorName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {e.entryType === 'Inward' ? (
                        <div className="flex flex-col gap-0.5">
                          {e.orderNumber && <span>Order: {e.orderNumber}</span>}
                          {e.invoiceNumber && <span>Invoice: {e.invoiceNumber}</span>}
                          {e.challanNumber && <span>Challan: {e.challanNumber}</span>}
                          {e.lrNumber && <span>LR: {e.lrNumber}</span>}
                          {e.ewayBillNumber && <span>E-way: {e.ewayBillNumber}</span>}
                          {!e.orderNumber && !e.invoiceNumber && !e.challanNumber && !e.lrNumber && !e.ewayBillNumber && '—'}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.usedInGrn ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border bg-slate-100 text-slate-500 border-slate-200 whitespace-nowrap">
                          Used in {e.usedInGrn}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border bg-green-100 text-green-700 border-green-200 whitespace-nowrap">
                          Available
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <NewGateEntryModal
          vendors={vendors}
          isLoadingVendors={isLoadingVendors}
          vendorPos={vendorPos}
          isLoadingPos={isLoadingPos}
          onClose={() => setIsModalOpen(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}

export default GateEntryModule;
