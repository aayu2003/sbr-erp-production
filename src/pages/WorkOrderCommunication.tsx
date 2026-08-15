import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, ClipboardCheck, FileText, Search, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { ComparativeQuotationApprovalRow } from '@/components/ho-inbox/ComparativeQuotationApprovalRow';
import { type ComparativeModel } from '@/components/purchase/ComparativeStatementPreview';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/config';
import { fetchOrderCommunication } from '@/lib/orderCommunication';
import {
  type ApiTcComparative,
  mapTcToModel,
  safeTrim,
  tcApproved,
  nfaApproved,
  orderCreated,
} from '@/lib/comparativeInbox';

type WorkOrderCommunicationProps = {
  title?: string;
};

// WO creation itself now lives on its own dedicated page (WOCreation.tsx,
// mirroring POCreation.tsx) — this page is only ever the TC/NFA approval
// register ("WO - Order Approval Flow"), so it no longer needs a view prop.
export default function WorkOrderCommunication({ title = 'WO - Order Approval Flow' }: WorkOrderCommunicationProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [all, setAll] = useState<Record<string, ComparativeModel>>({});
  const [loading, setLoading] = useState(false);
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
        // whether a WO was actually completed since get_TC's own status
        // fields can go stale.
        let withOrderStatus = mapped;
        try {
          const ocList = await fetchOrderCommunication(ac.signal);
          const byPrNumber: Record<string, (typeof ocList)[number]> = {};
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
        } catch (e: any) {
          if (e?.name !== 'AbortError') {
            // Non-fatal: fall back to get_TC's own indent_type/status fields.
          }
        }

        // ── Step 3: index by indentId ────────────────────────────────────
        // No local overrides/snapshots anymore — mapTcToModel already folds in
        // the row's "meta" (the full comparative model, once saved by
        // SprQuotationComparative.tsx) so everything here is backend-derived.
        const next: Record<string, ComparativeModel> = {};
        for (const m of withOrderStatus) {
          next[m.indentId] = m;
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

  // Only SPR (Work Order) rows belong on this page — PR/vendor comparatives
  // live on the separate "PO communication" page (HOInbox.tsx). A row keeps
  // showing here after TC/NFA/forwarding are done — same as the PO
  // communication page — with the row's own "FORWARDED" stamp indicating
  // completion, instead of removing it from view.
  const scopedInboxRows = useMemo(
    () => inboxRows.filter((row) => safeTrim(row.item.indent_type).toUpperCase() === 'SPR'),
    [inboxRows],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return scopedInboxRows.filter((row) => {
      const matchesQuery = !normalizedQuery || [
        row.item.indentId,
        row.item.title,
        row.item.comparisonId,
        row.item.hoSelectedVendorId,
        ...(row.item.vendors || []).flatMap((vendor) => [vendor.id, vendor.name]),
        ...(row.item.items || []).map((item) => item.partName),
      ].some((value) => safeTrim(value).toLowerCase().includes(normalizedQuery));
      return matchesQuery;
    });
  }, [scopedInboxRows, query]);

  const metrics = useMemo(() => {
    return {
      total: scopedInboxRows.length,
      pendingTc: scopedInboxRows.filter((row) => !tcApproved(row.item)).length,
      pendingNfa: scopedInboxRows.filter((row) => tcApproved(row.item) && !nfaApproved(row.item)).length,
      orders: scopedInboxRows.filter((row) => orderCreated(row.item)).length,
    };
  }, [scopedInboxRows]);

  // In-memory only — every field here (TC/NFA/WO status) is re-derived from
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
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0D3A35]">Procurement · Work Order</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">Approve TC and NFA, then forward the approved comparative statement to WO Creation.</p>
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
          { label: 'Work Orders Created', value: metrics.orders, icon: ShoppingCart, tone: 'bg-[#edf5f2] text-[#0D3A35]' },
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
              <h2 className="text-base font-bold text-slate-900">WO Comparative Statement Register</h2>
              <p className="mt-0.5 text-xs text-slate-500">Comparative Statement → TC Approval → NFA Approval → Forward to WO Creation.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block min-w-[300px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SR, vendor, service or comparison" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-[#0D3A35] focus:bg-white" />
              </label>
            </div>
          </div>
        </div>

        <div className="hidden grid-cols-[minmax(190px,1fr)_minmax(180px,1.15fr)_80px_80px_minmax(120px,.7fr)_minmax(120px,.7fr)_minmax(120px,.7fr)_minmax(250px,auto)] items-center border-b border-slate-200 bg-[#0D3A35] px-5 py-3 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-white lg:grid">
          <span>Comparative Statement No.</span>
          <span>Service Details</span>
          <span>UoM</span>
          <span>Qty.</span>
          <span>TC Approval</span>
          <span>NFA Approval</span>
          <span>WO Creation</span>
          <span>Actions</span>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">{[1, 2, 3].map((row) => <div key={row} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
        ) : filteredRows.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center"><ClipboardCheck className="h-10 w-10 text-slate-300" /><p className="mt-4 font-bold text-slate-700">No WO approval records found</p><p className="mt-1 text-sm text-slate-400">{query ? 'Try a different search term or document type.' : 'Forward a service comparative statement to populate this register.'}</p></div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredRows.map((row) => {
              const isTarget = Boolean(openIndentId) && row.item.indentId === openIndentId;
              return <ComparativeQuotationApprovalRow key={row.key} item={row.item} onOpen={(indentId) => navigate(`/ho/${indentId}`)} onUpdate={updateComparative} defaultOpen={isTarget} defaultTab={isTarget ? desiredTab : undefined} approvalFlowOnly />;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
