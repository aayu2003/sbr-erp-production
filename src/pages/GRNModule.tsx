import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  PackageCheck,
  Hash,
  RefreshCw,
  X,
  Loader2,
  AlertCircle,
  Plus,
  CheckCircle2,
  ArrowDownToLine,
  Eye,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import getBaseUrl from '@/lib/config';
import {
  getGateEntries,
  deleteGrn,
  listGrns,
  type GateEntryRecord,
  type GrnOrderInfo,
  type GRNRecord,
  type GrnStatus,
} from '@/lib/grnApi';
import { GrnCreateWizard } from '@/components/grn/GrnCreateWizard';
import { GrnPrint } from '@/components/grn/GrnPrint';
import { GrnDocumentPreview } from '@/components/grn/GrnDocumentPreview';

const safeTrim = (v: unknown) => String(v ?? '').trim();
const displayDate = (value?: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value || '—';
};

// Newest GRN first — e.g. GRN/26-27/023, .../022, .../021. Compares the fiscal-year segment
// first (so a newer year always sorts above an older one) then the running number
// numerically (so .../099 sorts above .../009, not below it as a plain string compare would
// once the count passes 3 digits). Falls back to a plain string compare for any manually
// entered GRN number that doesn't follow the GRN/{year}/{number} pattern.
const compareGrnNoDesc = (a: string, b: string) => {
  const partsA = a.split('/');
  const partsB = b.split('/');
  const runningA = Number(partsA[partsA.length - 1]);
  const runningB = Number(partsB[partsB.length - 1]);
  const prefixA = partsA.slice(0, -1).join('/');
  const prefixB = partsB.slice(0, -1).join('/');
  if (prefixA !== prefixB) return prefixB.localeCompare(prefixA);
  if (Number.isFinite(runningA) && Number.isFinite(runningB)) return runningB - runningA;
  return b.localeCompare(a);
};

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

// Sentinel value for the "No Order / Manual Entry" choice in the PO dropdown — e.g. fuel,
// where there's a genuine inward gate entry (invoice, e-way bill, etc.) but no PO to tie it to.
// Real PO rows never have an empty poNo (see poRows below), so '' can't collide with one.
const MANUAL_SETUP_ID = '__manual__';

type VendorOption = { vendor_id: string; vendor_name: string; firm_name?: string };

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
  | { kind: 'create'; order: GrnOrderInfo; gateEntryIds: string[] }
  | { kind: 'revise'; order: GrnOrderInfo; grn: GRNRecord }
  | { kind: 'view'; order: GrnOrderInfo; grn: GRNRecord };

export function GRNModule() {
  const [q, setQ] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [pane, setPane] = useState<PaneState>({ kind: 'empty' });
  const [isCreateSetupOpen, setIsCreateSetupOpen] = useState(false);
  const [setupPoId, setSetupPoId] = useState('');
  const [setupGateEntryIds, setSetupGateEntryIds] = useState<string[]>([]);
  const [setupGateEntries, setSetupGateEntries] = useState<GateEntryRecord[]>([]);
  const [isLoadingSetupEntries, setIsLoadingSetupEntries] = useState(false);
  // Manual Entry / No Order — vendor picked directly instead of resolved from a PO.
  const [manualVendorId, setManualVendorId] = useState('');
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GRNRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // All GRNs shown in the register.
  const [allGrns, setAllGrns] = useState<GRNRecord[]>([]);
  useEffect(() => {
    listGrns().then(setAllGrns).catch(() => setAllGrns([]));
  }, [refreshTick]);

  const filteredGrns = useMemo(() => {
    const query = q.trim().toLowerCase();
    const base = !query ? allGrns : allGrns.filter((grn) => (
      grn.grnNo.toLowerCase().includes(query) ||
      grn.poNo.toLowerCase().includes(query) ||
      grn.vendorName.toLowerCase().includes(query) ||
      grn.gateEntryIds.some((entryId) => entryId.toLowerCase().includes(query)) ||
      grn.items.some((item) => item.description.toLowerCase().includes(query))
    ));
    return [...base].sort((a, b) => compareGrnNoDesc(a.grnNo, b.grnNo));
  }, [allGrns, q]);

  const refresh = () => setRefreshTick((x) => x + 1);

  const buildOrderInfo = (row: GrnPoRow): GrnOrderInfo => ({
    poNo: row.poNo,
    prNo: row.prNo,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    vendorAddress: row.vendorAddress,
  });

  const openCreateSetup = () => {
    setSetupPoId('');
    setSetupGateEntryIds([]);
    setSetupGateEntries([]);
    setManualVendorId('');
    setIsCreateSetupOpen(true);
    setIsLoadingSetupEntries(true);
    getGateEntries()
      .then(setSetupGateEntries)
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to load gate entries'))
      .finally(() => setIsLoadingSetupEntries(false));
    if (vendors.length === 0) {
      setIsLoadingVendors(true);
      const url = String(getBaseUrl() ?? '').replace(/\/$/, '');
      fetch(`${url}/purchase_flow/get_vendors`)
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
    }
  };

  const isManualSetup = setupPoId === MANUAL_SETUP_ID;
  const setupOrder = isManualSetup ? null : (poRows.find((row) => row.id === setupPoId) ?? null);
  const manualVendor = vendors.find((v) => v.vendor_id === manualVendorId) ?? null;
  const availableSetupGateEntries = setupGateEntries.filter((entry) => (
    entry.entryType === 'Inward' &&
    !entry.usedInGrn &&
    (isManualSetup
      ? !entry.orderNumber && entry.vendorId === manualVendorId
      : entry.orderNumber === setupOrder?.poNo)
  ));

  const toggleSetupGateEntry = (entryId: string) => {
    setSetupGateEntryIds((current) => (
      current.includes(entryId) ? current.filter((id) => id !== entryId) : [...current, entryId]
    ));
  };

  const beginGrnCreation = () => {
    if (isManualSetup) {
      if (!manualVendorId) { toast.error('Select a vendor'); return; }
      if (setupGateEntryIds.length === 0) { toast.error('Select at least one inward gate entry'); return; }
      setPane({
        kind: 'create',
        order: {
          poNo: '',
          vendorId: manualVendorId,
          vendorName: manualVendor?.firm_name || manualVendor?.vendor_name || '',
        },
        gateEntryIds: setupGateEntryIds,
      });
      setIsCreateSetupOpen(false);
      return;
    }
    if (!setupOrder) { toast.error('Select a purchase order'); return; }
    if (!setupOrder.vendorId) { toast.error('Vendor could not be resolved for this purchase order yet'); return; }
    if (setupGateEntryIds.length === 0) { toast.error('Select at least one inward gate entry'); return; }
    setPane({ kind: 'create', order: buildOrderInfo(setupOrder), gateEntryIds: setupGateEntryIds });
    setIsCreateSetupOpen(false);
  };

  const orderInfoForGrn = (grn: GRNRecord): GrnOrderInfo => {
    const row = poRows.find((candidate) => candidate.poNo === grn.poNo);
    return row ? buildOrderInfo(row) : {
      poNo: grn.poNo,
      poDate: grn.poDate,
      prNo: grn.prNo,
      prDate: grn.prDate,
      prBy: grn.prBy,
      vendorId: grn.vendorId,
      vendorName: grn.vendorName,
      vendorAddress: grn.vendorAddress,
      department: grn.department,
      group: grn.group,
    };
  };

  const onOpenGrn = (grn: GRNRecord) => {
    setPane({ kind: 'view', order: orderInfoForGrn(grn), grn });
  };

  const onEditGrn = (grn: GRNRecord) => {
    setPane({ kind: 'revise', order: orderInfoForGrn(grn), grn });
  };

  const requestDeleteGrn = (grn: GRNRecord) => {
    if (grn.status === 'approved') { toast.error('Approved GRNs cannot be deleted'); return; }
    setDeleteTarget(grn);
  };

  const confirmDeleteGrn = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteGrn(deleteTarget.grnNo);
      toast.success(`${deleteTarget.grnNo} deleted`);
      setDeleteTarget(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete GRN');
    } finally {
      setIsDeleting(false);
    }
  };


  return (
    <div className="min-h-screen animate-in space-y-6 bg-slate-50/70 p-4 font-sans duration-300 fade-in sm:p-6 lg:p-8">

      {/* ── Page Header ── */}
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-[#0D3A35] p-3.5 text-white shadow-[0_12px_28px_-12px_rgba(13,58,53,0.75)]">
            <PackageCheck className="h-7 w-7" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#0D3A35]">Inventory Operations</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Goods Receipt Notes</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-lg">
              Generate and track Goods Receipt Notes against live purchase orders.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={openCreateSetup}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0D3A35] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#092e2a]"
          >
            <Plus className="h-4 w-4" />
            Create GRN
          </button>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <RefreshCw className={cn('h-4 w-4 text-slate-500', isLoadingFlows && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── GRN Register ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">GRN Register</h2>
            <p className="mt-0.5 text-xs text-slate-500">{filteredGrns.length} of {allGrns.length} goods receipt notes</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search GRN, PO, gate entry, vendor or item"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#0D3A35] focus:bg-white focus:ring-2 focus:ring-[#0D3A35]/10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] table-fixed text-sm">
            <thead className="bg-[#0D3A35] text-white">
              <tr>
                {['GRN No.', 'GRN Date', 'Purchase Order', 'Gate Entry', 'Vendor', 'Items', 'Received Qty.', 'GRN Value', 'Prepared By', 'Status', 'Action'].map((heading) => (
                  <th key={heading} className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.08em]">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredGrns.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-16 text-center">
                    <PackageCheck className="mx-auto h-9 w-9 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-600">No GRNs found</p>
                    <p className="mt-1 text-xs text-slate-400">Create a GRN after recording the inward gate entry.</p>
                  </td>
                </tr>
              ) : filteredGrns.map((grn) => {
                const receivedQty = grn.items.reduce((total, item) => total + item.receivedQty, 0);
                const grnValue = grn.items.reduce((total, item) => total + item.totalGrnValue, 0);
                const units = Array.from(new Set(grn.items.map((item) => item.uom).filter(Boolean)));
                return (
                  <tr key={grn.grnNo} className="transition hover:bg-emerald-50/30">
                    <td className="px-3 py-3 text-center font-mono text-xs font-bold text-[#0D3A35]">{grn.grnNo}</td>
                    <td className="px-3 py-3 text-center text-xs text-slate-600">{displayDate(grn.grnDate)}</td>
                    <td className="px-3 py-3 text-center font-mono text-xs text-slate-700">{grn.poNo || '—'}</td>
                    <td className="px-3 py-3 text-center text-xs text-slate-600">
                      <div className="line-clamp-2">{grn.gateEntryIds.join(', ') || '—'}</div>
                    </td>
                    <td className="px-3 py-3 text-left text-xs font-medium text-slate-700"><div className="line-clamp-2">{grn.vendorName || '—'}</div></td>
                    <td className="px-3 py-3 text-center text-xs text-slate-600">{grn.items.length}</td>
                    <td className="px-3 py-3 text-center text-xs font-semibold text-slate-700">{receivedQty.toLocaleString('en-IN')} {units.length === 1 ? units[0] : ''}</td>
                    <td className="px-3 py-3 text-right text-xs font-semibold text-slate-800">₹{grnValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-3 text-center text-xs text-slate-600">{grn.preparedBy?.name || '—'}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn('inline-flex rounded-full border px-2 py-1 text-[10px] font-bold', STATUS_TONE[grn.status])}>{STATUS_LABEL[grn.status]}</span>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenGrn(grn)}
                          title="View GRN"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#0D3A35] transition hover:border-emerald-300 hover:bg-emerald-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditGrn(grn)}
                          title={grn.status === 'approved' ? 'Edit and resend for approval' : 'Edit GRN'}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteGrn(grn)}
                          title={grn.status === 'approved' ? 'Approved GRNs cannot be deleted' : 'Delete GRN'}
                          className={cn(
                            'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition',
                            grn.status === 'approved' ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300' : 'border-red-100 bg-white text-red-500 hover:border-red-200 hover:bg-red-50',
                          )}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── GRN Create / Revise / View ── */}
      {pane.kind !== 'empty' && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between bg-[#0D3A35] px-5 py-4 text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">Goods Receipt Note</p>
                <h2 className="mt-1 text-lg font-bold">
                  {pane.kind === 'create' ? `Create GRN · ${pane.order.poNo}` : pane.kind === 'revise' ? `${pane.grn.status === 'needs_revision' ? 'Revise' : 'Edit'} ${pane.grn.grnNo}` : pane.grn.grnNo}
                </h2>
              </div>
              <button type="button" onClick={() => setPane({ kind: 'empty' })} className="rounded-lg p-2 transition hover:bg-white/10" aria-label="Close GRN">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {pane.kind === 'create' && (
                <GrnCreateWizard
                  order={pane.order}
                  initialGateEntryIds={pane.gateEntryIds}
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
                <div className="flex h-[82vh] flex-col">
                  <div className="flex-1 overflow-y-auto bg-slate-50 p-5"><GrnDocumentPreview grn={pane.grn} /></div>
                  <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
                    <GrnPrint grn={pane.grn} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#0D3A35] px-5 py-4 text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">GRN Register</p>
                <h2 className="mt-1 text-lg font-bold">Delete GRN</h2>
              </div>
              <button type="button" onClick={() => !isDeleting && setDeleteTarget(null)} className="rounded-lg p-2 transition hover:bg-white/10" aria-label="Close delete confirmation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">
              <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Delete {deleteTarget.grnNo}?</p>
                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  This will remove the GRN and release its linked gate entries. This action cannot be undone.
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-400">Purchase Order</span><p className="mt-1 font-semibold text-slate-700">{deleteTarget.poNo}</p></div>
                <div><span className="text-slate-400">Vendor</span><p className="mt-1 font-semibold text-slate-700">{deleteTarget.vendorName}</p></div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button type="button" disabled={isDeleting} onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={isDeleting} onClick={confirmDeleteGrn} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {isDeleting ? 'Deleting…' : 'Delete GRN'}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* ── CREATE GRN SETUP: PO first, then its unused inward gate entries ── */}
        {isCreateSetupOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex shrink-0 items-start justify-between bg-[#0D3A35] px-6 py-5 text-white">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">Goods Receipt Workflow</p>
                  <h2 className="mt-1 text-xl font-bold">Create GRN</h2>
                  <p className="mt-1 text-sm text-emerald-100/75">Select the purchase order, then link its inward gate entry before entering receipt details.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateSetupOpen(false)}
                  className="rounded-lg p-2 transition hover:bg-white/10"
                  aria-label="Close create GRN"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0D3A35] text-xs font-bold text-white">1</span>
                  <span className="text-xs font-bold uppercase tracking-wide text-[#0D3A35]">Purchase Order</span>
                  <span className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                    setupPoId ? 'bg-[#0D3A35] text-white' : 'border border-slate-300 bg-white text-slate-400',
                  )}>2</span>
                  <span className={cn('text-xs font-bold uppercase tracking-wide', setupPoId ? 'text-[#0D3A35]' : 'text-slate-400')}>Inward Gate Entry</span>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-600">
                    Purchase Order <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={setupPoId}
                    onChange={(event) => {
                      setSetupPoId(event.target.value);
                      setSetupGateEntryIds([]);
                    }}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/10"
                  >
                    <option value="">Select purchase order</option>
                    <option value={MANUAL_SETUP_ID}>Manual Entry / No Order</option>
                    {poRows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.poNo} · {row.vendorName} {row.prNo ? `· PR ${row.prNo}` : ''}
                      </option>
                    ))}
                  </select>
                  {setupOrder && (
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                      <span><strong className="text-slate-700">Vendor:</strong> {setupOrder.vendorName}</span>
                      <span><strong className="text-slate-700">PR:</strong> {setupOrder.prNo || 'Not Recorded'}</span>
                    </div>
                  )}
                  {isManualSetup && (
                    <div className="mt-3">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-600">
                        Vendor <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={manualVendorId}
                        onChange={(event) => {
                          setManualVendorId(event.target.value);
                          setSetupGateEntryIds([]);
                        }}
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#0D3A35] focus:ring-2 focus:ring-[#0D3A35]/10"
                      >
                        <option value="">{isLoadingVendors ? 'Loading vendors…' : 'Select a vendor'}</option>
                        {vendors.map((v) => (
                          <option key={v.vendor_id} value={v.vendor_id}>{v.firm_name || v.vendor_name}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-400">No purchase order — used for cases like fuel where there's an inward gate entry but no PO.</p>
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
                      Inward Gate Entries <span className="text-red-500">*</span>
                    </label>
                    {(setupOrder || (isManualSetup && manualVendorId)) && !isLoadingSetupEntries && (
                      <span className="text-xs font-medium text-slate-400">{availableSetupGateEntries.length} available</span>
                    )}
                  </div>

                  {isManualSetup && !manualVendorId ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      Select a vendor to view its gate entries.
                    </div>
                  ) : !setupOrder && !isManualSetup ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      Select a purchase order to view its gate entries.
                    </div>
                  ) : isLoadingSetupEntries ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-8 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading inward gate entries…
                    </div>
                  ) : availableSetupGateEntries.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-center">
                      <AlertCircle className="mx-auto h-7 w-7 text-amber-500" />
                      <p className="mt-2 text-sm font-semibold text-amber-800">No unused inward gate entry found</p>
                      <p className="mt-1 text-xs text-amber-700">
                        {isManualSetup
                          ? 'Material must first be recorded as inward against this vendor (with no order number) in Gate Entry.'
                          : `Material must first be recorded as inward against ${setupOrder?.poNo} in Gate Entry.`}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {availableSetupGateEntries.map((entry) => {
                        const selected = setupGateEntryIds.includes(entry.enteryId);
                        return (
                          <button
                            type="button"
                            key={entry.enteryId}
                            onClick={() => toggleSetupGateEntry(entry.enteryId)}
                            className={cn(
                              'grid w-full grid-cols-[auto_1fr] gap-3 rounded-xl border p-4 text-left transition sm:grid-cols-[auto_1.2fr_1fr_1fr]',
                              selected ? 'border-[#0D3A35] bg-emerald-50 shadow-sm' : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30',
                            )}
                          >
                            <span className={cn(
                              'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border',
                              selected ? 'border-[#0D3A35] bg-[#0D3A35] text-white' : 'border-slate-300 bg-white text-transparent',
                            )}>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </span>
                            <div>
                              <p className="font-mono text-xs font-bold text-slate-800">{entry.siteEntryNo || entry.enteryId}</p>
                              <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700"><ArrowDownToLine className="h-3 w-3" /> Inward · {displayDate(entry.entryDate)} {entry.entryTime}</p>
                            </div>
                            <div className="text-xs">
                              <p className="font-semibold text-slate-700">{entry.itemName || 'Item Not Recorded'}</p>
                              <p className="mt-1 text-slate-500">{entry.itemQuantity ?? '—'} {entry.itemUnit || ''}</p>
                            </div>
                            <div className="text-xs">
                              <p className="font-semibold text-slate-700">{entry.invoiceNumber ? `Invoice ${entry.invoiceNumber}` : 'Invoice Not Recorded'}</p>
                              <p className="mt-1 text-slate-500">{entry.destinationName || entry.gateNo || 'Destination Not Recorded'}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setIsCreateSetupOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={beginGrnCreation}
                  disabled={isManualSetup ? (!manualVendorId || setupGateEntryIds.length === 0) : (!setupOrder || setupGateEntryIds.length === 0)}
                  className="rounded-xl bg-[#0D3A35] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#092e2a] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Continue to GRN Details
                </button>
              </div>
            </div>
          </div>
        )}

    </div>
  );
}

export default GRNModule;
