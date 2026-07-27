import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  PackageCheck,
  Hash,
  Building2,
  FileCheck,
  User,
  Layers,
  RefreshCw,
  ArrowUpRight,
  X,
  Loader2,
  AlertCircle,
  Phone,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import {
  getGrnsByOrder,
  listGrns,
  type GrnOrderInfo,
  type GRNRecord,
  type GrnStatus,
} from '@/lib/grnApi';
import { GrnCreateWizard } from '@/components/grn/GrnCreateWizard';
import { GrnPrint } from '@/components/grn/GrnPrint';
import { GrnStickerPrint } from '@/components/grn/GrnStickerPrint';
import { GrnDocumentPreview } from '@/components/grn/GrnDocumentPreview';

const safeTrim = (v: unknown) => String(v ?? '').trim();

// Shape returned by /purchase_flow/get_purchase_flows — only the fields GRN needs.
type ApiPurchaseFlow = {
  comparison_id?: unknown;
  flow_id?: unknown;
  order_number?: unknown;
  order_type?: unknown;
  pr_number?: unknown;
  timestamp?: unknown;
};

// Shape returned by /purchase_flow/get_left_panel_info/{comparison_id} — only the vendor bits.
type LeftPanelInfo = {
  pr_number?: string;
  approved_vendor_id?: string;
  vendor_details?: {
    vendor_name?: string;
    vendor_contact?: string;
    vendor_address?: string;
  } | null;
};

// Shape returned by /purchase_flow/get_doc_url_of_order/{order_number}.
type OrderDocResponse = {
  document_url?: string;
  detail?: string;
};

// A live PR/PO row for the GRN left panel — flow metadata merged with its fetched vendor info.
type GrnPoRow = {
  id: string;
  poNo: string;
  prNo: string;
  vendorId: string;
  vendorName: string;
  vendorContact?: string;
  vendorAddress?: string;
  createdAt: string;
};

// Mirrors PurchaseFlow.tsx's fetchPurchaseFlows() — same endpoint, same GET-then-POST-fallback
// (some deployments only accept POST on this route).
async function fetchPurchaseFlows(signal?: AbortSignal): Promise<ApiPurchaseFlow[]> {
  const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('API base URL is not set');

  const url = `${baseUrl}/purchase_flow/get_purchase_flows`;
  const doFetch = (method: 'GET' | 'POST') =>
    fetch(url, { method, headers: { Accept: 'application/json' }, signal });

  let res = await doFetch('GET');
  if (res.status === 405) res = await doFetch('POST');

  const text = await res.text().catch(() => '');
  let data: { purchase_flows?: unknown; message?: unknown; error?: unknown } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      safeTrim(data?.message) ||
      safeTrim(data?.error) ||
      text ||
      `Failed to load purchase orders (HTTP ${res.status})`;
    throw new Error(message);
  }

  const list = data?.purchase_flows;
  return Array.isArray(list) ? (list as ApiPurchaseFlow[]) : [];
}

const STATUS_LABEL: Record<GrnStatus, string> = {
  pending_verification: 'Pending Verification',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  needs_revision: 'Needs Revision',
};
const STATUS_TONE: Record<GrnStatus, string> = {
  pending_verification: 'bg-orange-100 text-orange-700 border-orange-200',
  pending_approval: 'bg-blue-100 text-blue-700 border-blue-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  needs_revision: 'bg-red-100 text-red-700 border-red-200',
};

type PaneState =
  | { kind: 'empty' }
  | { kind: 'create'; order: GrnOrderInfo }
  | { kind: 'revise'; order: GrnOrderInfo; grn: GRNRecord }
  | { kind: 'view'; order: GrnOrderInfo; grn: GRNRecord };

export function GRNModule() {
  const [q, setQ] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [pane, setPane] = useState<PaneState>({ kind: 'empty' });

  const [flows, setFlows] = useState<ApiPurchaseFlow[]>([]);
  const [isLoadingFlows, setIsLoadingFlows] = useState(true);
  const [flowsError, setFlowsError] = useState<string | null>(null);
  const [leftPanelInfoMap, setLeftPanelInfoMap] = useState<Record<string, LeftPanelInfo>>({});

  // ── Fetch live purchase flows (same endpoint PurchaseFlow.tsx uses) ──
  useEffect(() => {
    const ac = new AbortController();
    setIsLoadingFlows(true);
    setFlowsError(null);
    fetchPurchaseFlows(ac.signal)
      .then(setFlows)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        const message = e instanceof Error ? e.message : 'Failed to load purchase orders';
        setFlowsError(message);
        toast.error(message);
        setFlows([]);
      })
      .finally(() => setIsLoadingFlows(false));
    return () => ac.abort();
  }, [refreshTick]);

  // GRN applies to goods, not services — only PR (Purchase Requisition/Order) flows are
  // relevant here; SPR (Service Purchase Requisition / Work Order) flows are excluded.
  const prFlows = useMemo(
    () => flows.filter((f) => safeTrim(f.order_type).toUpperCase() === 'PR'),
    [flows],
  );

  // ── Fetch each flow's vendor info (same per-row pattern PurchaseFlow.tsx uses) ──
  useEffect(() => {
    if (prFlows.length === 0) return;
    const ac = new AbortController();
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    if (!baseUrl) return;

    prFlows.forEach(async (flow) => {
      const comparisonId = safeTrim(flow.comparison_id);
      if (!comparisonId) return;
      const flowId = safeTrim(flow.flow_id) || comparisonId;

      try {
        const res = await fetch(`${baseUrl}/purchase_flow/get_left_panel_info/${encodeURIComponent(comparisonId)}`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          signal: ac.signal,
        });
        if (!res.ok) return;
        const data: LeftPanelInfo = await res.json().catch(() => null);
        if (data) setLeftPanelInfoMap((prev) => ({ ...prev, [flowId]: data }));
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    });

    return () => ac.abort();
  }, [prFlows]);

  const poRows = useMemo<GrnPoRow[]>(() => {
    return prFlows
      .map((flow) => {
        const comparisonId = safeTrim(flow.comparison_id);
        const flowId = safeTrim(flow.flow_id) || comparisonId;
        const info = leftPanelInfoMap[flowId];
        return {
          id: flowId,
          poNo: safeTrim(flow.order_number) || '—',
          prNo: safeTrim(flow.pr_number) || safeTrim(info?.pr_number),
          vendorId: safeTrim(info?.approved_vendor_id),
          vendorName: safeTrim(info?.vendor_details?.vendor_name) || '—',
          vendorContact: info?.vendor_details?.vendor_contact,
          vendorAddress: info?.vendor_details?.vendor_address,
          createdAt: safeTrim(flow.timestamp),
        };
      })
      .filter((r) => r.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [prFlows, leftPanelInfoMap]);

  const orders = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return poRows;
    return poRows.filter((o) => (
      o.poNo.toLowerCase().includes(query) ||
      o.vendorName.toLowerCase().includes(query) ||
      o.prNo.toLowerCase().includes(query)
    ));
  }, [poRows, q]);

  // All GRNs, fetched once per refresh — used for the summary stats row.
  const [allGrns, setAllGrns] = useState<GRNRecord[]>([]);
  useEffect(() => {
    listGrns().then(setAllGrns).catch(() => setAllGrns([]));
  }, [refreshTick]);

  const stats = useMemo(() => ({
    openPOs: poRows.length,
    pendingVerification: allGrns.filter((g) => g.status === 'pending_verification').length,
    pendingApproval: allGrns.filter((g) => g.status === 'pending_approval').length,
    approved: allGrns.filter((g) => g.status === 'approved').length,
  }), [poRows, allGrns]);

  // Every PO can have multiple GRNs, so each visible row's GRNs are fetched by PO number
  // (same per-row pattern already used for vendor info above).
  const [grnsByPoNo, setGrnsByPoNo] = useState<Record<string, GRNRecord[]>>({});
  useEffect(() => {
    poRows.forEach((row) => {
      getGrnsByOrder(row.poNo)
        .then((grns) => setGrnsByPoNo((prev) => ({ ...prev, [row.poNo]: grns })))
        .catch(() => {});
    });
  }, [poRows, refreshTick]);

  const refresh = () => setRefreshTick((x) => x + 1);

  const activePoNo = pane.kind === 'empty' ? null : pane.order.poNo;
  const activeGrnNo = pane.kind === 'create' || pane.kind === 'empty' ? null : pane.grn.grnNo;

  const buildOrderInfo = (row: GrnPoRow): GrnOrderInfo => ({
    poNo: row.poNo,
    prNo: row.prNo,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    vendorAddress: row.vendorAddress,
  });

  const onCreateNew = (row: GrnPoRow) => {
    if (!row.vendorId) { toast.error('Vendor could not be resolved for this PO yet — try refreshing.'); return; }
    setPane({ kind: 'create', order: buildOrderInfo(row) });
  };

  const onOpenGrn = (row: GrnPoRow, grn: GRNRecord) => {
    const order = buildOrderInfo(row);
    if (grn.status === 'needs_revision') {
      setPane({ kind: 'revise', order, grn });
    } else {
      setPane({ kind: 'view', order, grn });
    }
  };

  // ── Order document preview — same endpoint/pattern as the WCC certificate's "Preview order
  // document" arrow (WccCertificatePreview.tsx's handleOpenOrderPreview) ──
  const [orderPreviewPoNo, setOrderPreviewPoNo] = useState<string | null>(null);
  const [orderDocUrl, setOrderDocUrl] = useState<string | null>(null);
  const [orderDocLoading, setOrderDocLoading] = useState(false);
  const [orderDocError, setOrderDocError] = useState<string | null>(null);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);

  const openOrderPreview = (poNo: string) => {
    if (!poNo || poNo === '—') return;
    setOrderPreviewPoNo(poNo);
    setOrderDocUrl(null);
    setOrderDocError(null);
    setOrderDocLoading(true);
    const baseUrl = String(getBaseUrl() ?? '').replace(/\/$/, '');
    fetch(`${baseUrl}/purchase_flow/get_doc_url_of_order/${encodeURIComponent(poNo)}`)
      .then(async (res) => {
        const data: OrderDocResponse | null = await res.json().catch(() => null);
        if (!res.ok || !data?.document_url) throw new Error(data?.detail || 'Document not found for this order number');
        setOrderDocUrl(data.document_url);
      })
      .catch((err: unknown) => setOrderDocError(err instanceof Error ? err.message : 'Failed to load order document'))
      .finally(() => setOrderDocLoading(false));
  };

  // The order document is frequently a fixed-width HTML/PDF page (sized for print) rather
  // than a responsive one — loaded cross-origin, so we can't reflow its own CSS. Instead we
  // render the iframe at a fixed baseline "page" width and visually scale *the iframe itself*
  // to fill however wide the panel actually is, which is what stops it being stranded in the
  // left half of the panel with blank space on the right.
  const DOC_BASE_WIDTH = 816; // ~8.5in @ 96dpi — typical print-page width
  const previewFrameWrapRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    const el = previewFrameWrapRef.current;
    if (!el || !orderDocUrl) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setPreviewScale(width / DOC_BASE_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [orderDocUrl, isPreviewMaximized]);

  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-300 min-h-screen bg-gray-50/50 font-sans">

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100 shadow-sm">
            <PackageCheck className="w-7 h-7 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">GRN Module</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-lg">
              Generate and track Goods Receipt Notes against live purchase orders.
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
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Open Purchase Orders', value: stats.openPOs, icon: Hash, color: 'indigo' as const },
          { label: 'Pending Verification', value: stats.pendingVerification, icon: FileCheck, color: 'orange' as const },
          { label: 'Pending Approval', value: stats.pendingApproval, icon: Layers, color: 'blue' as const },
          { label: 'Approved GRNs', value: stats.approved, icon: PackageCheck, color: 'green' as const },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-4">
            <div className={cn(
              'p-3 rounded-xl border',
              s.color === 'indigo' && 'bg-indigo-50 border-indigo-100 text-indigo-600',
              s.color === 'orange' && 'bg-orange-50 border-orange-100 text-orange-600',
              s.color === 'blue' && 'bg-blue-50 border-blue-100 text-blue-600',
              s.color === 'green' && 'bg-green-50 border-green-100 text-green-600',
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

      {/* ── Main Layout: PO list (25%) + wizard (flex) + optional docked order-doc preview ── */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ── LEFT: Live / Open PO Panel (25%) ── */}
        <div className="w-full lg:w-1/4 shrink-0 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col" style={{ maxHeight: '75vh' }}>
          <div className="p-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Live / Open POs</h2>
              <span className="ml-auto text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                {orders.length}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search PO, vendor or PR…"
                className="w-full pl-8 pr-3 h-8 rounded-lg border border-gray-200 bg-gray-50 text-xs placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {isLoadingFlows ? (
              <div className="flex flex-col gap-3 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse space-y-2 p-3 rounded-lg border border-gray-100">
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                    <div className="h-2.5 bg-gray-50 rounded w-1/2" />
                    <div className="h-2.5 bg-gray-50 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : flowsError ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl">
                  <PackageCheck className="w-8 h-8 text-red-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600">Failed to load purchase orders</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">{flowsError}</p>
                </div>
                <button
                  type="button"
                  onClick={refresh}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <PackageCheck className="w-8 h-8 text-slate-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600">No open purchase orders</p>
                  <p className="text-xs text-slate-400 mt-1">Incoming POs will appear here once synced.</p>
                </div>
              </div>
            ) : (
              orders.map((o) => {
                const orderGrns = grnsByPoNo[o.poNo] || [];
                const isActive = activePoNo === o.poNo;
                return (
                  <div
                    key={o.id}
                    className={cn(
                      'px-4 py-3.5 transition-all border-l-2',
                      isActive ? 'bg-indigo-50/80 border-indigo-500' : 'border-transparent hover:bg-gray-50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 truncate">
                          <Hash className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          {o.poNo}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                          <FileCheck className="w-3 h-3 shrink-0" />
                          PR: {o.prNo || '—'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openOrderPreview(o.poNo)}
                        title="Preview order document"
                        className="shrink-0 p-1 rounded hover:bg-indigo-50 text-indigo-600 transition-colors"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Vendor — shown prominently */}
                    <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-indigo-50/60 border border-indigo-100 px-2.5 py-2">
                      <Building2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-800 truncate">{o.vendorName}</div>
                        {o.vendorContact && (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 truncate">
                            <Phone className="w-3 h-3 shrink-0" /> {o.vendorContact}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Existing GRNs for this PO — a PO can have several */}
                    {orderGrns.length > 0 && (
                      <div className="mt-2.5 space-y-1.5">
                        {orderGrns.map((g) => (
                          <button
                            type="button"
                            key={g.grnNo}
                            onClick={() => onOpenGrn(o, g)}
                            className={cn(
                              'w-full flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition-colors',
                              activeGrnNo === g.grnNo ? 'bg-indigo-50 border-indigo-300' : 'border-gray-200 hover:bg-gray-50',
                            )}
                          >
                            <span className="font-mono text-[11px] text-slate-600 truncate">{g.grnNo}</span>
                            <span className={cn(
                              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold border whitespace-nowrap shrink-0',
                              STATUS_TONE[g.status],
                            )}>
                              {STATUS_LABEL[g.status]}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="mt-2.5">
                      <button
                        type="button"
                        onClick={() => onCreateNew(o)}
                        disabled={!o.vendorId}
                        title={!o.vendorId ? 'Vendor could not be resolved for this PO yet' : undefined}
                        className={cn(
                          'w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors shadow-sm',
                          o.vendorId
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            : 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none',
                        )}
                      >
                        {orderGrns.length > 0 ? '+ New GRN' : 'Create GRN'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── MIDDLE: GRN Preview / Wizard Panel (flex-1) ── */}
        <div className="flex-1 min-w-0 w-full bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col" style={{ maxHeight: '75vh' }}>
          {pane.kind === 'empty' && (
            <div className="flex-1 flex flex-col items-center justify-center p-16 gap-5 text-center">
              <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-3xl">
                <PackageCheck className="w-12 h-12 text-indigo-300" />
              </div>
              <div>
                <p className="text-base font-semibold text-slate-700">Select a Purchase Order</p>
                <p className="text-sm text-slate-400 mt-1 max-w-xs">
                  Pick an open PO from the left panel to create or review its GRN.
                </p>
              </div>
            </div>
          )}

          {pane.kind === 'create' && (
            <GrnCreateWizard
              order={pane.order}
              onDone={() => { refresh(); setPane({ kind: 'empty' }); }}
              onCancel={() => setPane({ kind: 'empty' })}
            />
          )}

          {pane.kind === 'revise' && (
            <GrnCreateWizard
              order={pane.order}
              existingGrn={pane.grn}
              onDone={() => { refresh(); setPane({ kind: 'empty' }); }}
              onCancel={() => setPane({ kind: 'empty' })}
            />
          )}

          {pane.kind === 'view' && (
            <>
              {/* Detail Header */}
              <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-indigo-50/50 via-white to-white shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 bg-indigo-100 border border-indigo-200 rounded-xl shrink-0 mt-0.5">
                      <PackageCheck className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-800 truncate">{pane.grn.grnNo}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-medium">
                          <Hash className="w-3 h-3 text-indigo-400" /> PO: {pane.grn.poNo}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-gray-400" /> {pane.grn.vendorName}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-gray-400" /> {pane.grn.preparedBy?.name || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pane.grn.status && (
                      <span className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border',
                        STATUS_TONE[pane.grn.status],
                      )}>
                        {STATUS_LABEL[pane.grn.status]}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5">
                <GrnDocumentPreview grn={pane.grn} />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
                <GrnPrint grn={pane.grn} />
                <GrnStickerPrint
                  payload={{
                    tagId: pane.grn.grnNo,
                    grnNo: pane.grn.grnNo,
                    grnDate: pane.grn.grnDate,
                    poNo: pane.grn.poNo,
                    vendorName: pane.grn.vendorName,
                    totalItems: pane.grn.items.length,
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Order Document Preview — docked alongside the wizard (not a blocking
            modal), so you can keep it open while filling in item values. Can be maximized
            for a closer look, then restored without losing wizard state. ── */}
        {orderPreviewPoNo && isPreviewMaximized && (
          <div
            className="fixed inset-0 z-[99] bg-black/30 backdrop-blur-[1px]"
            onClick={() => setIsPreviewMaximized(false)}
          />
        )}
        {orderPreviewPoNo && (
          <div
            className={cn(
              'bg-white border border-gray-200 shadow-sm flex flex-col animate-in duration-200',
              isPreviewMaximized
                ? 'fixed inset-4 z-[100] rounded-2xl shadow-2xl zoom-in-95'
                : 'w-full lg:shrink-0 rounded-xl fade-in slide-in-from-right-2',
            )}
            style={isPreviewMaximized ? undefined : { width: 'min(720px, 42vw)', maxHeight: '85vh' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Order Document</h3>
                <p className="text-[11px] text-slate-400 font-mono truncate">{orderPreviewPoNo}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPreviewMaximized((v) => !v)}
                  title={isPreviewMaximized ? 'Restore' : 'Maximize'}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {isPreviewMaximized ? <Minimize2 className="w-4 h-4 text-gray-500" /> : <Maximize2 className="w-4 h-4 text-gray-500" />}
                </button>
                <button
                  type="button"
                  onClick={() => { setOrderPreviewPoNo(null); setIsPreviewMaximized(false); }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 relative overflow-hidden min-h-[300px]">
              {orderDocLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-sm font-medium">Loading order document…</span>
                </div>
              ) : orderDocError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-400 px-6 text-center">
                  <AlertCircle className="w-8 h-8" />
                  <span className="text-sm font-medium">{orderDocError}</span>
                </div>
              ) : orderDocUrl ? (
                /\.(jpe?g|png|gif|webp|bmp)(\?|#|$)/i.test(orderDocUrl) ? (
                  // Image documents: the browser doesn't stretch a raw <img> to fill an iframe
                  // on its own, so render it directly and let it scale to the panel's width.
                  <div className="w-full h-full overflow-auto">
                    <img src={orderDocUrl} alt="Order document" className="w-full h-auto block" />
                  </div>
                ) : (
                  // PDF/HTML documents: these are frequently fixed-width, print-sized pages
                  // that won't reflow to the panel's actual width on their own (and being
                  // cross-origin, we can't reach into the document to fix its own CSS). So the
                  // iframe is rendered at a fixed baseline width/height and scaled as a whole
                  // via CSS transform to fill however wide this wrapper measures — that's what
                  // stops the content being stranded in the left portion of the panel.
                  <div ref={previewFrameWrapRef} className="w-full h-full overflow-auto">
                    <iframe
                      src={`${orderDocUrl}#view=FitH`}
                      title="Order document preview"
                      style={{
                        width: DOC_BASE_WIDTH,
                        height: DOC_BASE_WIDTH * 1.414,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                        border: 0,
                      }}
                    />
                  </div>
                )
              ) : null}
            </div>
            {orderDocUrl && (
              <div className="px-4 py-3 border-t border-gray-100 flex justify-end shrink-0">
                <a
                  href={orderDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                >
                  Open in new tab <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GRNModule;
