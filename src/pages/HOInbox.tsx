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
};

const HO_OVERRIDES_KEY = 'farmconnect.hoInboxOverrides.v1';
const COMPARATIVE_SNAPSHOT_KEY = 'farmconnect.prComparative.v1';

type HoOverrides = Record<
  string,
  {
    hoSelectedVendorId?: string;
    hoForwardedAt?: string;
    tcApprovedVendorId?: string;
    tcApprovedAt?: string;
    hoLocked?: boolean;
    poCreatedAt?: string;
    poNo?: string;
    poStatus?: string;
    poNextProcessSeries?: string[];
  }
>;

const readHoOverrides = (): HoOverrides => {
  try {
    const raw = window.localStorage.getItem(HO_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeHoOverrides = (next: HoOverrides) => {
  try {
    window.localStorage.setItem(HO_OVERRIDES_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
};

const readComparativeSnapshots = (): Record<string, ComparativeModel> => {
  try {
    const raw = window.localStorage.getItem(COMPARATIVE_SNAPSHOT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
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

  const model: ComparativeModel = {
    indentId: prNumber,
    comparisonId: comparisonId || undefined,
    title: 'Price Comparative Statement',
    subTitle: undefined,
    vendors,
    items,
    quotes,
    freightCharges,
    otherCharges,
    paymentTerms,
    deliveryTimeline,
    priceBasis: {},
    warranty,
    vendorStatus: {},
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
  SPR: { label: 'SPR',             full: 'Special Purchase Requisitions' },
  WO:  { label: 'Work Orders',     full: 'Work Orders' },
  PO:  { label: 'Purchase Orders', full: 'Purchase Orders' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function HOInbox() {
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

        // ── Step 2: resolve definitive order type for every item ───────────
        // find_the_order_type is the authoritative source; runs in parallel.
        const typeResults = await Promise.allSettled(
          mapped.map(async (m) => {
            try {
              const r = await fetch(`${baseUrl}/purchase_flow/find_the_order_type`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
                body: JSON.stringify({ pr_number: m.indentId }),
                signal: ac.signal,
              });
              if (!r.ok) return m;
              const d = await r.json().catch(() => null);
              const orderType = safeTrim((d as any)?.order_type).toUpperCase() || undefined;
              return orderType ? { ...m, indent_type: orderType } : m;
            } catch {
              return m;
            }
          })
        );

        const resolvedMapped = typeResults.map((r, i) =>
          r.status === 'fulfilled' ? r.value : mapped[i]
        );

        // ── Step 3: merge with local HO overrides ──────────────────────────
        const overrides = readHoOverrides();
        const snapshots = readComparativeSnapshots();
        const next: Record<string, ComparativeModel> = {};
        for (const m of resolvedMapped) {
          const o = overrides[m.indentId];
          const snapshot = snapshots[m.indentId];
          const completeModel: ComparativeModel = snapshot
            ? {
                ...m,
                ...snapshot,
                indentId: m.indentId,
                comparisonId: m.comparisonId || snapshot.comparisonId,
                flowStatus: m.flowStatus,
                tcStatus: m.tcStatus,
                nfaStatus: m.nfaStatus,
                backendApprovedVendorId: m.backendApprovedVendorId,
                tcApprovedVendorId: m.tcApprovedVendorId,
                tcApprovedAt: m.tcApprovedAt,
                indent_type: m.indent_type || snapshot.indent_type,
              }
            : m;
          next[m.indentId] = o
            ? {
                ...completeModel,
                ...o,
                hoSelectedVendorId: o.hoSelectedVendorId || completeModel.hoSelectedVendorId,
                tcApprovedVendorId: completeModel.tcApprovedVendorId || o.tcApprovedVendorId,
                tcApprovedAt: o.tcApprovedAt || completeModel.tcApprovedAt,
                hoForwardedAt: o.hoForwardedAt || completeModel.hoForwardedAt,
              }
            : completeModel;
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
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: inboxRows.length };
    for (const r of inboxRows) {
      const type = safeTrim(r.item.indent_type).toUpperCase() || 'OTHER';
      counts[type] = (counts[type] || 0) + 1;
    }
    return counts;
  }, [inboxRows]);

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
    return inboxRows.filter((row) => {
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
  }, [inboxRows, activeTab, query]);

  const metrics = useMemo(() => ({
    total: inboxRows.length,
    pending: inboxRows.filter((row) => !safeTrim(row.item.tcApprovedVendorId)).length,
    approved: inboxRows.filter((row) => Boolean(safeTrim(row.item.tcApprovedVendorId))).length,
    orders: inboxRows.filter((row) => Boolean(safeTrim((row.item as any).poNo) || safeTrim((row.item as any).poCreatedAt))).length,
  }), [inboxRows]);

  const updateComparative = (indentId: string, patch: Partial<ComparativeModel>) => {
    setAll((prev) => {
      const existing = prev[indentId];
      if (!existing) return prev;
      const merged = { ...existing, ...patch };
      const overrides = readHoOverrides();
      overrides[indentId] = {
        ...overrides[indentId],
        hoSelectedVendorId: merged.hoSelectedVendorId,
        hoForwardedAt: merged.hoForwardedAt,
        tcApprovedVendorId: merged.tcApprovedVendorId,
        tcApprovedAt: merged.tcApprovedAt,
        hoLocked: (merged as any)?.hoLocked,
      };
      writeHoOverrides(overrides);
      return { ...prev, [indentId]: merged };
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
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0D3A35]">Purchase &amp; Procurement</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">Head Office Procurement Control</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">Review commercial comparisons, approve the selected vendor, create PO/WO documents and control forwarding to Finance Admin Operations.</p>
          </div>
        </div>
        <div className="rounded-xl border border-[#d7e4e0] bg-[#edf5f2] px-4 py-3 text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#58716a]">Live Register</p>
          <p className="mt-1 text-sm font-bold text-[#0D3A35]">{filteredRows.length} record{filteredRows.length === 1 ? '' : 's'} shown</p>
        </div>
      </header>

      <section className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Comparatives', value: metrics.total, icon: FileText, tone: 'bg-slate-100 text-slate-700' },
          { label: 'Pending HO Approval', value: metrics.pending, icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-700' },
          { label: 'TC Approved', value: metrics.approved, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
          { label: 'PO / WO Created', value: metrics.orders, icon: ShoppingCart, tone: 'bg-[#edf5f2] text-[#0D3A35]' },
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
              <h2 className="text-base font-bold text-slate-900">HO Approval Register</h2>
              <p className="mt-0.5 text-xs text-slate-500">Commercial comparison, TC approval and PO/WO processing in one controlled register.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block min-w-[300px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search PR, vendor, item or comparison" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-[#0D3A35] focus:bg-white" />
              </label>
              <div className="flex min-w-max items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                {visibleTabs.map((tab) => {
                  const meta = TAB_META[tab] ?? { label: tab, full: tab };
                  const active = activeTab === tab;
                  return <button key={tab} type="button" title={meta.full} onClick={() => setActiveTab(tab)} className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition', active ? 'bg-[#0D3A35] text-white shadow-sm' : 'text-slate-500 hover:bg-white hover:text-slate-800')}><span>{meta.label}</span><span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-white/15 text-white' : 'bg-slate-200/70 text-slate-500')}>{tabCounts[tab] ?? 0}</span></button>;
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50/70 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.11em] text-slate-400">
          Purchase workflow records · click a row to review complete details
        </div>

        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3].map((row) => <div key={row} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
        ) : filteredRows.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center"><ClipboardCheck className="h-10 w-10 text-slate-300" /><p className="mt-4 font-bold text-slate-700">No HO records found</p><p className="mt-1 text-sm text-slate-400">{query ? 'Try a different search term or document type.' : activeTab === 'all' ? 'Forward a commercial comparison to populate this register.' : `No ${TAB_META[activeTab]?.full ?? activeTab} are available.`}</p></div>
        ) : (
          <div className="space-y-3 p-4">
            {filteredRows.map((row) => {
              const isTarget = Boolean(openIndentId) && row.item.indentId === openIndentId;
              return <ComparativeQuotationApprovalRow key={row.key} item={row.item} onOpen={(indentId) => navigate(`/ho/${indentId}`)} onUpdate={updateComparative} defaultOpen={isTarget} defaultTab={isTarget ? desiredTab : undefined} />;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
