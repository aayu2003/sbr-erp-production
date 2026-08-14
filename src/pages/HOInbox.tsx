import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, ClipboardCheck, FileText, Search, ShoppingCart } from 'lucide-react';

import { ComparativeQuotationApprovalRow } from '@/components/ho-inbox/ComparativeQuotationApprovalRow';
import { type ComparativeModel } from '@/components/purchase/ComparativeStatementPreview';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/config';
import { toast } from 'sonner';

type ApiTcItemRow = {
  item_name?: unknown;
  UoM?: unknown;
  gst_percentage?: unknown;
  quantity?: unknown;
};

type ApiTcQuoter = {
  vendor_id?: unknown;
  item_costing?: unknown;
  freight_charges?: unknown;
  other_charges?: unknown;
  subtotal?: unknown;
  total_amount?: unknown;
  payment_terms?: unknown;
  delivery_time?: unknown;
  warrenty_garantee?: unknown;
};

type ApiOrderCommunication = {
  comparision_id?: unknown;
  pr_number?: unknown;
  TC_status?: unknown;
  NFA_status?: unknown;
  approved_vendor_id?: unknown;
  indent_type?: unknown;
  order_number?: unknown;
  order_status?: unknown;
};

type ApiTcComparative = {
  created_at?: unknown;
  quoters?: unknown;
  item_row?: unknown;
  technical_recommendation?: unknown;
  status?: unknown;
  pr_number?: unknown;
  approved_vendor_id?: unknown;
  TC_status?: unknown;
  NFA_status?: unknown;
  comparison_id?: unknown;
  comparision_id?: unknown;
  indent_type?: unknown;
  meta?: unknown;
};

const safeTrim = (v: unknown) => String(v ?? '').trim();

const numOr0 = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

const stableItemId = (itemName: string, idx: number) => {
  const base = safeTrim(itemName) || 'item';
  const safe = base.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `it-${idx + 1}-${safe || 'x'}`;
};

const mapTcToModel = (x: ApiTcComparative): ComparativeModel | null => {
  const prNumber = safeTrim((x as any)?.pr_number);
  if (!prNumber) return null;

  const comparisonId = safeTrim((x as any)?.comparison_id ?? (x as any)?.comparision_id);
  const flowStatus = safeTrim((x as any)?.status);
  const tcStatus = safeTrim((x as any)?.TC_status);
  const nfaStatus = safeTrim((x as any)?.NFA_status);
  const backendApprovedVendorId = safeTrim((x as any)?.approved_vendor_id);

  const tcStatusLower = tcStatus.toLowerCase();
  const isTcApproved =
    tcStatusLower === 'approved' ||
    (Boolean(backendApprovedVendorId) && (!tcStatusLower || tcStatusLower !== 'pending'));

  const rawItems = Array.isArray((x as any)?.item_row) ? ((x as any).item_row as ApiTcItemRow[]) : [];
  const itemIdByName: Record<string, string> = {};
  const items: ComparativeModel['items'] = rawItems
    .map((r, idx) => {
      const name = safeTrim((r as any)?.item_name);
      const id = stableItemId(name || `item-${idx + 1}`, idx);
      if (name) itemIdByName[name.toLowerCase()] = id;
      return {
        id,
        srNo: idx + 1,
        partName: name,
        uom: safeTrim((r as any)?.UoM),
        qty: numOr0((r as any)?.quantity),
        gstPercent: numOr0((r as any)?.gst_percentage),
      };
    })
    .filter((it) => it.id);

  const rawQuoters = Array.isArray((x as any)?.quoters) ? ((x as any).quoters as ApiTcQuoter[]) : [];

  const vendors: NonNullable<ComparativeModel['vendors']> = [];
  const seenVendor: Record<string, true | undefined> = {};
  for (const q of rawQuoters) {
    const vendorId = safeTrim((q as any)?.vendor_id);
    if (!vendorId || seenVendor[vendorId]) continue;
    seenVendor[vendorId] = true;
    vendors.push({ id: vendorId, name: vendorId, directoryVendorId: vendorId });
  }

  const paymentTerms: Record<string, string> = {};
  const deliveryTimeline: Record<string, string> = {};
  const warranty: Record<string, string> = {};
  const freightCharges: Record<string, number> = {};
  const otherCharges: Record<string, number> = {};

  const quotes: NonNullable<ComparativeModel['quotes']> = rawQuoters
    .map((q) => {
      const vendorId = safeTrim((q as any)?.vendor_id);
      if (!vendorId) return null;

      const pt = safeTrim((q as any)?.payment_terms);
      const dt = safeTrim((q as any)?.delivery_time);
      const wg = safeTrim((q as any)?.warrenty_garantee);
      if (pt) paymentTerms[vendorId] = pt;
      if (dt) deliveryTimeline[vendorId] = dt;
      if (wg) warranty[vendorId] = wg;

      freightCharges[vendorId] = numOr0((q as any)?.freight_charges);
      otherCharges[vendorId] = numOr0((q as any)?.other_charges);

      const itemCosting = (q as any)?.item_costing;
      const unitRateByItemId: Record<string, number> = {};
      if (itemCosting && typeof itemCosting === 'object') {
        for (const [itemName, row] of Object.entries(itemCosting as Record<string, any>)) {
          const key = safeTrim(itemName).toLowerCase();
          const mappedId = itemIdByName[key];
          if (!mappedId) continue;
          const unit = numOr0((row as any)?.per_unit_costing);
          if (mappedId) unitRateByItemId[mappedId] = unit;
        }
      }

      return {
        vendorId,
        unitRateByItemId,
      };
    })
    .filter(Boolean) as any;

  const techRec = safeTrim((x as any)?.technical_recommendation);
  const createdAt = safeTrim((x as any)?.created_at);

  // Rows saved after the "meta" field was introduced carry the entire
  // Comparative model from QuotationComparative.tsx/SprQuotationComparative.tsx
  // (comparisonNo, revision, comparison basis, award strategy, custom charges,
  // technical/scope parameters, etc.). Use it to fill in everything this
  // function doesn't otherwise compute from item_row/quoters — the explicit
  // fields below still win since backend status fields must stay authoritative.
  const rawMeta = (x as any)?.meta;
  const meta: Partial<ComparativeModel> = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};

  const model: ComparativeModel = {
    ...meta,
    indentId: prNumber,
    comparisonId: comparisonId || undefined,
    title: meta.title || 'Price Comparative Statement',
    vendors,
    items,
    quotes,
    freightCharges,
    otherCharges,
    paymentTerms,
    deliveryTimeline,
    priceBasis: meta.priceBasis || {},
    warranty,
    vendorStatus: meta.vendorStatus || {},
    technicalRecommendationVendorId: techRec || undefined,
    lastSavedAt: createdAt || undefined,
    isDraft: false,
    hoSelectedVendorId: backendApprovedVendorId || undefined,
    hoForwardedAt: undefined,
    backendApprovedVendorId: backendApprovedVendorId || undefined,
    flowStatus: flowStatus || undefined,
    tcStatus: tcStatus || undefined,
    nfaStatus: nfaStatus || undefined,

    tcApprovedVendorId: isTcApproved ? (backendApprovedVendorId || undefined) : undefined,
    tcApprovedAt: undefined,
    indent_type: (() => {
      const t = safeTrim((x as any)?.indent_type).toUpperCase();
      return t === 'SPR' ? 'SPR' : t === 'PR' ? 'PR' : undefined;
    })(),
  };

  return model;
};

// ─── Tab configuration ────────────────────────────────────────────────────────

const TAB_ORDER = ['all', 'PR', 'SPR', 'WO', 'PO'] as const;

const TAB_META: Record<string, { label: string; full: string }> = {
  all: { label: 'All',             full: 'All Orders' },
  PR:  { label: 'PR',              full: 'Purchase Requisitions' },
  SPR: { label: 'SPR',             full: 'Service Purchase Requisitions' },
  WO:  { label: 'Work Orders',     full: 'Work Orders' },
  PO:  { label: 'Purchase Orders', full: 'Purchase Orders' },
};

// ─── Component ────────────────────────────────────────────────────────────────

type HOInboxProps = {
  orderTypeFilter?: 'PR' | 'SPR';
  view?: 'all' | 'approval' | 'creation';
  title?: string;
};

const tcApproved = (item: ComparativeModel) =>
  safeTrim(item.tcStatus).toLowerCase() === 'approved' || Boolean(safeTrim(item.tcApprovedVendorId));
const nfaApproved = (item: ComparativeModel) => safeTrim(item.nfaStatus).toLowerCase() === 'approved';
const orderCreated = (item: ComparativeModel) =>
  Boolean(safeTrim((item as any).poNo) || safeTrim((item as any).poCreatedAt));
const forwardedToOrderCreation = (item: ComparativeModel) => Boolean(safeTrim((item as any).hoForwardedAt));

export default function HOInbox({ orderTypeFilter, view = 'all', title }: HOInboxProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [all, setAll] = useState<Record<string, ComparativeModel>>({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [query, setQuery] = useState('');

  const openIndentId = safeTrim(searchParams.get('open'));
  const desiredTab = (() => {
    const t = safeTrim(searchParams.get('tab')).toLowerCase();
    if (t === 'indent' || t === 'comparative' || t === 'po') return t as 'indent' | 'comparative' | 'po';
    return undefined;
  })();

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    const load = async () => {
      const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
      if (!baseUrl) return;

      setLoading(true);
      try {
        // ── Step 1: fetch all TC comparatives ──────────────────────────────
        const url = `${baseUrl}/purchase_flow/get_TC`;
        const doFetch = (method: 'GET' | 'POST') =>
          fetch(url, {
            method,
            headers: { Accept: 'application/json' },
            signal: ac.signal,
          });

        let res = await doFetch('GET');
        if (res.status === 405) res = await doFetch('POST');

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(errText || `HTTP ${res.status}`);
        }

        const data: unknown = await res.json().catch(() => null);
        const list: ApiTcComparative[] = Array.isArray(data) ? (data as ApiTcComparative[]) : [];
        const mapped = list.map(mapTcToModel).filter(Boolean) as ComparativeModel[];

        // ── Step 2: overlay authoritative type/TC/NFA/PO status ────────────
        // get_order_communication is the single source of truth here — its
        // indent_type always matches the order type (no separate
        // find_the_order_type lookup needed), and it's authoritative for
        // whether a PO/WO was actually completed since get_TC's own status
        // fields can go stale.
        let withOrderStatus = mapped;
        try {
          const ocUrl = `${baseUrl}/purchase_flow/get_order_communication`;
          const doOcFetch = (method: 'GET' | 'POST') =>
            fetch(ocUrl, { method, headers: { Accept: 'application/json' }, signal: ac.signal });

          let ocRes = await doOcFetch('GET');
          if (ocRes.status === 405) ocRes = await doOcFetch('POST');

          if (ocRes.ok) {
            const ocData: unknown = await ocRes.json().catch(() => null);
            const ocList: ApiOrderCommunication[] = Array.isArray((ocData as any)?.order_communication)
              ? (ocData as any).order_communication
              : [];
            const byPrNumber: Record<string, ApiOrderCommunication> = {};
            for (const entry of ocList) {
              const pr = safeTrim(entry?.pr_number);
              if (pr) byPrNumber[pr] = entry;
            }

            withOrderStatus = mapped.map((m) => {
              const entry = byPrNumber[safeTrim(m.indentId)];
              if (!entry) return m;

              const tcStatus = safeTrim(entry.TC_status) || m.tcStatus;
              const nfaStatus = safeTrim(entry.NFA_status) || m.nfaStatus;
              const approvedVendorId = safeTrim(entry.approved_vendor_id) || m.backendApprovedVendorId;
              const orderNumber = safeTrim(entry.order_number);
              const orderStatus = safeTrim(entry.order_status).toLowerCase();
              const indentType = safeTrim(entry.indent_type).toUpperCase();

              return {
                ...m,
                tcStatus,
                nfaStatus,
                backendApprovedVendorId: approvedVendorId,
                tcApprovedVendorId: tcStatus.toLowerCase() === 'approved' ? (approvedVendorId || m.tcApprovedVendorId) : m.tcApprovedVendorId,
                poNo: orderNumber || m.poNo,
                poStatus: orderStatus || m.poStatus,
                indent_type: indentType || m.indent_type,
              };
            });
          }
        } catch (e: any) {
          if (e?.name !== 'AbortError') {
            // Non-fatal: fall back to get_TC's own indent_type/status fields.
          }
        }

        // ── Step 3: index by indentId ────────────────────────────────────
        // No local overrides/snapshots anymore — mapTcToModel already folds in
        // the row's "meta" (the full comparative model, once saved by
        // QuotationComparative.tsx/SprQuotationComparative.tsx) so everything
        // here is backend-derived.
        let forwardedMap: Record<string, string> = {};
        try {
          const saved = window.localStorage.getItem('farmconnect.orderCreationForwarded.v1');
          forwardedMap = saved ? JSON.parse(saved) : {};
        } catch {
          forwardedMap = {};
        }

        const next: Record<string, ComparativeModel> = {};
        for (const m of withOrderStatus) {
          next[m.indentId] = forwardedMap[m.indentId]
            ? { ...m, hoForwardedAt: forwardedMap[m.indentId] } as ComparativeModel
            : m;
        }

        if (!cancelled) setAll(next);
      } catch (e: any) {
        if (cancelled) return;
        const msg = safeTrim(e?.message ?? e);
        toast.error(`Failed to load comparatives${msg ? `: ${msg}` : ''}`);
        setAll({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  const comparativeRows = useMemo(() => {
    return Object.values(all)
      .filter((x) => x && x.indentId)
      .sort((a, b) => (b.indentId || '').localeCompare(a.indentId || ''));
  }, [all]);

  const inboxRows = useMemo(() => {
    return comparativeRows.map((x) => ({ kind: 'comparative' as const, key: x.indentId, item: x }));
  }, [comparativeRows]);

  // ── Tab counts ─────────────────────────────────────────────────────────────
  const scopedInboxRows = useMemo(() => inboxRows.filter((row) => {
    if (orderTypeFilter && safeTrim(row.item.indent_type).toUpperCase() !== orderTypeFilter) return false;
    if (view === 'approval') return !orderCreated(row.item);
    if (view === 'creation') return nfaApproved(row.item) && forwardedToOrderCreation(row.item) && !orderCreated(row.item);
    return true;
  }), [inboxRows, orderTypeFilter, view]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: scopedInboxRows.length };
    for (const r of scopedInboxRows) {
      const type = safeTrim(r.item.indent_type).toUpperCase() || 'OTHER';
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }, [scopedInboxRows]);

  // Only show tabs that actually have items, in logical order
  const visibleTabs = useMemo(() => {
    const known = (TAB_ORDER as readonly string[]).filter(
      (t) => t === 'all' || (tabCounts[t] ?? 0) > 0
    );
    const extras = Object.keys(tabCounts).filter(
      (t) => t !== 'all' && !(TAB_ORDER as readonly string[]).includes(t) && tabCounts[t] > 0
    );
    return [...known, ...extras];
  }, [tabCounts]);

  // Rows visible in the current tab
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return scopedInboxRows.filter((row) => {
      const matchesTab = activeTab === 'all' || safeTrim(row.item.indent_type).toUpperCase() === activeTab;
      const matchesQuery = !normalizedQuery || [
        row.item.indentId,
        row.item.title,
        row.item.comparisonId,
        row.item.hoSelectedVendorId,
        ...(row.item.vendors || []).flatMap((vendor) => [vendor.id, vendor.name]),
        ...(row.item.items || []).map((item) => item.partName),
      ].some((value) => safeTrim(value).toLowerCase().includes(normalizedQuery));
      return matchesTab && matchesQuery;
    });
  }, [scopedInboxRows, activeTab, query]);

  const metrics = useMemo(() => {
    return {
      total: scopedInboxRows.length,
      pendingTc: scopedInboxRows.filter((row) => !tcApproved(row.item)).length,
      pendingNfa: scopedInboxRows.filter((row) => tcApproved(row.item) && !nfaApproved(row.item)).length,
      orders: scopedInboxRows.filter((row) => orderCreated(row.item)).length,
    };
  }, [scopedInboxRows]);

  // In-memory only — every field here (TC/NFA/PO status) is re-derived from
  // the backend on the next load, so nothing needs local persistence. This
  // just gives instant feedback for the rest of the current session.
  const updateComparative = (indentId: string, patch: Partial<ComparativeModel>) => {
    setAll((prev) => {
      const existing = prev[indentId];
      if (!existing) return prev;
      return { ...prev, [indentId]: { ...existing, ...patch } };
    });
  };

  return (
    <div className="min-h-screen space-y-6 bg-slate-50/70 p-4 font-sans sm:p-6 lg:p-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D3A35] text-white shadow-[0_12px_28px_-12px_rgba(13,58,53,0.75)]">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0D3A35]">Procurement · {orderTypeFilter === 'SPR' ? 'Work Order' : 'Purchase Order'}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{title || 'Order Approval Flow'}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">{orderTypeFilter === 'SPR' && view === 'approval' ? 'Approve TC and NFA, then forward the approved comparative statement to WO Creation.' : `Track every ${orderTypeFilter === 'SPR' ? 'service' : 'vendor'} comparative statement through TC approval, NFA approval and ${orderTypeFilter === 'SPR' ? 'work' : 'purchase'} order creation.`}</p>
          </div>
        </div>
        <div className="rounded-xl border border-[#d7e4e0] bg-[#edf5f2] px-4 py-3 text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#58716a]">Live Register</p>
          <p className="mt-1 text-sm font-bold text-[#0D3A35]">{filteredRows.length} record{filteredRows.length === 1 ? '' : 's'} shown</p>
        </div>
      </header>

      <section className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Comparative Statements', value: metrics.total, icon: FileText, tone: 'bg-slate-100 text-slate-700' },
          { label: 'Pending TC Approval', value: metrics.pendingTc, icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-700' },
          { label: 'Pending NFA Approval', value: metrics.pendingNfa, icon: CheckCircle2, tone: 'bg-blue-50 text-blue-700' },
          { label: orderTypeFilter === 'SPR' && view === 'approval' ? 'Ready for WO Creation' : `${orderTypeFilter === 'SPR' ? 'Work' : 'Purchase'} Orders Created`, value: orderTypeFilter === 'SPR' && view === 'approval' ? scopedInboxRows.filter((row) => nfaApproved(row.item)).length : metrics.orders, icon: ShoppingCart, tone: 'bg-[#edf5f2] text-[#0D3A35]' },
        ].map(({ label, value, icon: Icon, tone }, index) => (
          <div key={label} className={cn('flex items-center justify-between px-5 py-5', index > 0 && 'sm:border-l', index > 1 && 'sm:border-t xl:border-t-0', 'border-slate-200')}>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>
            <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tone)}><Icon className="h-5 w-5" /></span>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">{orderTypeFilter === 'SPR' ? 'WO Comparative Statement Register' : 'Vendor Comparative Statement Register'}</h2>
              <p className="mt-0.5 text-xs text-slate-500">Comparative Statement → TC Approval → NFA Approval → {orderTypeFilter === 'SPR' && view === 'approval' ? 'Forward to WO Creation' : `${orderTypeFilter === 'SPR' ? 'Work' : 'Purchase'} Order`}.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block min-w-[300px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${orderTypeFilter === 'SPR' ? 'SR, vendor, service' : 'PR, vendor, item'} or comparison`} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-[#0D3A35] focus:bg-white" />
              </label>
              {!orderTypeFilter && <div className="flex min-w-max items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                {visibleTabs.map((tab) => {
                  const meta = TAB_META[tab] ?? { label: tab, full: tab };
                  const active = activeTab === tab;
                  return <button key={tab} type="button" title={meta.full} onClick={() => setActiveTab(tab)} className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition', active ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-800')}><span>{meta.label}</span><span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-white/15 text-white' : 'bg-slate-200/70 text-slate-500')}>{tabCounts[tab] ?? 0}</span></button>;
                })}
              </div>}
            </div>
          </div>
        </div>

        <div className="hidden grid-cols-[minmax(190px,1fr)_minmax(180px,1.15fr)_80px_80px_minmax(120px,.7fr)_minmax(120px,.7fr)_minmax(120px,.7fr)_minmax(250px,auto)] items-center border-b border-slate-200 bg-[#0D3A35] px-5 py-3 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-white lg:grid">
          <span>Comparative Statement No.</span>
          <span>{orderTypeFilter === 'SPR' ? 'Service Details' : 'Item Details'}</span>
          <span>UoM</span>
          <span>Qty.</span>
          {view === 'creation' ? (
            <>
              <span>Approved Vendor</span>
              <span>Order Value</span>
              <span>Forwarded On</span>
            </>
          ) : (
            <>
              <span>TC Approval</span>
              <span>NFA Approval</span>
              <span>{orderTypeFilter === 'SPR' && view === 'approval' ? 'WO Creation' : orderTypeFilter === 'SPR' ? 'Work Order' : 'Purchase Order'}</span>
            </>
          )}
          <span>Actions</span>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3].map((row) => <div key={row} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
        ) : filteredRows.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center"><ClipboardCheck className="h-10 w-10 text-slate-300" /><p className="mt-4 font-bold text-slate-700">No {orderTypeFilter === 'SPR' ? 'WO approval' : 'HO'} records found</p><p className="mt-1 text-sm text-slate-400">{query ? 'Try a different search term or document type.' : activeTab === 'all' ? `Forward a ${orderTypeFilter === 'SPR' ? 'service' : 'commercial'} comparative statement to populate this register.` : `No ${TAB_META[activeTab]?.full ?? activeTab} are available.`}</p></div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredRows.map((row) => {
              const isTarget = Boolean(openIndentId) && row.item.indentId === openIndentId;
              return <ComparativeQuotationApprovalRow key={row.key} item={row.item} onOpen={(indentId) => navigate(`/ho/${indentId}`)} onUpdate={updateComparative} defaultOpen={isTarget} defaultTab={isTarget ? desiredTab : undefined} approvalFlowOnly={view === 'approval'} creationFlow={view === 'creation'} />;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
