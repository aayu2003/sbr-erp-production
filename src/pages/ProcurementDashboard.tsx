import { useEffect, useMemo, useState } from "react";
import getBaseUrl from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import { fetchOrderCommunication, type ApiOrderCommunication } from "@/lib/orderCommunication";
import { fetchGuestProcurementDashboard } from "@/lib/guestApi";
import GuestLocked from "@/components/guest/GuestLocked";
import ShareDashboardDialog from "@/components/procurement/ShareDashboardDialog";
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ClipboardList,
  Eye,
  Layers,
  Loader2,
  PackageCheck,
  RefreshCw,
  Share2,
  ShoppingCart,
  Truck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderKind = "PO" | "WO";

/**
 * Stages visible from `get_order_communication`. Every row in that feed already
 * has a comparative statement, so the pipeline shown here starts at "Comparative".
 * Requisition raising / verification / indent approval happen upstream and are
 * implied (the comparative could not exist otherwise).
 */
const PRE_ORDER_STAGES = ["Comparative", "TC Approval", "NFA Approval", "PO / WO Creation"] as const;
type Stage = (typeof PRE_ORDER_STAGES)[number];

type PendingRow = {
  prNumber: string;
  comparisonId: string;
  kind: OrderKind;
  vendorId: string;
  vendorName?: string;
  /** Index of the last completed stage in PRE_ORDER_STAGES. */
  doneIdx: number;
  pendingStage: Stage;
};

type ActiveRow = {
  orderNumber: string;
  kind: OrderKind;
  vendor?: string;
  orderValue: number;
  doneValue: number;
  poDate: string;
};

// ── API helpers ───────────────────────────────────────────────────────────────

const norm = (v: unknown) => String(v ?? "").trim();
const isApproved = (v: unknown) => norm(v).toLowerCase() === "approved";
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toPendingRow = (
  e: ApiOrderCommunication,
  vendorNames: Record<string, string>,
): PendingRow | null => {
  const prNumber = norm(e.pr_number);
  if (!prNumber) return null;

  // An order already exists → not "left to be made".
  const orderCreated = !!norm(e.order_number) || norm(e.order_status).toLowerCase() === "forwarded";
  if (orderCreated) return null;

  const tcOk = isApproved(e.TC_status);
  const nfaOk = isApproved(e.NFA_status);
  const doneIdx = nfaOk ? 2 : tcOk ? 1 : 0;
  const vendorId = norm(e.approved_vendor_id);

  return {
    prNumber,
    comparisonId: norm(e.comparision_id),
    kind: norm(e.indent_type).toUpperCase() === "SPR" ? "WO" : "PO",
    vendorId,
    vendorName: vendorNames[vendorId],
    doneIdx,
    pendingStage: PRE_ORDER_STAGES[doneIdx + 1],
  };
};

const fetchJson = async (url: string, signal?: AbortSignal): Promise<unknown> => {
  const doFetch = (method: "GET" | "POST") =>
    fetch(url, { method, headers: { Accept: "application/json" }, signal });
  let res = await doFetch("GET");
  if (res.status === 405) res = await doFetch("POST");
  if (!res.ok) return null;
  return res.json().catch(() => null);
};

const vendorNameMap = (list: unknown[]): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const v of list) {
    const rec = (v ?? {}) as Record<string, unknown>;
    const id = norm(rec.vendor_id);
    const name = norm(rec.vendor_name);
    if (id && name) map[id] = name;
  }
  return map;
};

const fetchVendorNames = async (
  baseUrl: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> => {
  if (!baseUrl) return {};
  const data = (await fetchJson(`${baseUrl}/purchase_flow/get_vendors`, signal)) as
    | { vendors?: unknown }
    | null;
  const vendorsField = data && typeof data === "object" ? data.vendors : null;
  return vendorNameMap(Array.isArray(vendorsField) ? vendorsField : []);
};

type ApiOrderProgress = {
  order_number?: unknown;
  progress?: unknown;
  po_date?: unknown;
  po_value?: unknown;
  order_type?: unknown;
};

const fetchOrderProgress = async (
  baseUrl: string,
  signal?: AbortSignal,
): Promise<ApiOrderProgress[]> => {
  if (!baseUrl) return [];
  const data = (await fetchJson(`${baseUrl}/purchase_flow/get_order_progress`, signal)) as
    | { order_progress?: unknown }
    | null;
  const field = data && typeof data === "object" ? data.order_progress : null;
  return Array.isArray(field) ? (field as ApiOrderProgress[]) : [];
};

// ── Formatting helpers ────────────────────────────────────────────────────────

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const inrShort = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `₹${(n / 100_000).toFixed(1)} L`;
  return inr(n);
};
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const kindChip: Record<OrderKind, string> = {
  PO: "bg-blue-100 text-blue-700",
  WO: "bg-teal-100 text-teal-700",
};

// ── Component ─────────────────────────────────────────────────────────────────

type DashTab = "pending" | "completion";

const ProcurementDashboard = () => {
  const { user, guest, guestChecking } = useAuth();
  const isGuestView = !!guest;

  const [tab, setTab] = useState<DashTab>("completion");
  const [rows, setRows] = useState<PendingRow[] | null>(null);
  const [activeRows, setActiveRows] = useState<ActiveRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  const guestToken = guest?.token ?? "";

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const baseUrl = String(getBaseUrl() ?? "").replace(/\/$/, "");

        let oc: ApiOrderCommunication[];
        let progress: ApiOrderProgress[];
        let vendorNames: Record<string, string>;

        if (guestToken) {
          const bundle = await fetchGuestProcurementDashboard(guestToken, ac.signal);
          oc = bundle.order_communication as ApiOrderCommunication[];
          progress = bundle.order_progress as ApiOrderProgress[];
          vendorNames = vendorNameMap(bundle.vendors);
        } else {
          [oc, vendorNames, progress] = await Promise.all([
            fetchOrderCommunication(ac.signal),
            fetchVendorNames(baseUrl, ac.signal),
            fetchOrderProgress(baseUrl, ac.signal),
          ]);
        }

        // Section 1 — comparatives with no order yet.
        const pending = (oc
          .map((e) => toPendingRow(e, vendorNames))
          .filter(Boolean) as PendingRow[])
          .sort((a, b) => b.doneIdx - a.doneIdx || a.prNumber.localeCompare(b.prNumber));

        // order_number → vendor label, harvested from get_order_communication.
        const vendorByOrder: Record<string, string> = {};
        for (const e of oc) {
          const on = norm(e.order_number);
          if (!on) continue;
          const vid = norm(e.approved_vendor_id);
          vendorByOrder[on] = vendorNames[vid] || vid;
        }

        // Section 2 — released orders with progress.
        const active: ActiveRow[] = progress
          .map((p) => {
            const orderNumber = norm(p.order_number);
            return {
              orderNumber,
              kind: norm(p.order_type).toLowerCase() === "work_order" ? "WO" : "PO",
              vendor: vendorByOrder[orderNumber],
              orderValue: num(p.po_value),
              doneValue: num(p.progress),
              poDate: norm(p.po_date),
            } as ActiveRow;
          })
          .filter((r) => r.orderNumber);
        // Display order is decided by ActiveOrdersSection's sort controls.

        if (!cancelled) {
          setRows(pending);
          setActiveRows(active);
        }
      } catch (e) {
        const err = e as { name?: string; message?: string };
        if (err?.name === "AbortError") return;
        if (!cancelled) {
          setError(norm(err?.message) || "Could not load procurement data");
          setRows([]);
          setActiveRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [reloadKey, guestToken]);

  const k = useMemo(() => {
    const a = activeRows ?? [];
    const sumBy = (kind: OrderKind) =>
      a.filter((o) => o.kind === kind).reduce((s, o) => s + o.orderValue, 0);
    return {
      // Released order value, split by type (Section 2 / get_order_progress).
      poRelease: sumBy("PO"),
      woRelease: sumBy("WO"),
      // Released but not finished — progress below order value (or value unknown).
      underProcess: a.filter((o) => o.orderValue <= 0 || o.doneValue < o.orderValue).length,
      // Section 1 — TC not done, or NFA not done, or PO/WO not cut.
      pending: (rows ?? []).length,
    };
  }, [rows, activeRows]);

  const kpiCards = [
    { label: "Total PO Release", value: inrShort(k.poRelease), sub: "value of released purchase orders", icon: ShoppingCart, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Total WO Release", value: inrShort(k.woRelease), sub: "value of released work orders", icon: Truck, color: "text-teal-600", bg: "bg-teal-50" },
    { label: "Orders Under Process", value: k.underProcess, sub: "released, not yet fully done", icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Orders Pending", value: k.pending, sub: "TC / NFA / order not done", icon: ClipboardList, color: "text-amber-600", bg: "bg-amber-50" },
  ];

  // Not signed in and no valid share session → don't render the dashboard at all.
  if (!user && !guest) {
    if (guestChecking) {
      return (
        <div className="flex min-h-full items-center justify-center bg-[#f7f7f8]">
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold">Opening shared dashboard…</span>
          </div>
        </div>
      );
    }
    return <GuestLocked invalid />;
  }

  return (
    <div className="min-h-full bg-[#f7f7f8] p-4 text-slate-900">
      <div className="mx-auto max-w-[1480px] space-y-5">
        {isGuestView && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
            <Eye className="h-4 w-4 shrink-0" />
            You&apos;re viewing a shared, read-only copy of the Procurement Dashboard. Other modules are locked.
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-normal text-slate-900 sm:text-3xl">Procurement Dashboard</h1>
            <p className="mt-1 text-sm font-medium text-slate-500 sm:mt-1.5 sm:text-base">
              Orders pending creation &amp; completion of released orders
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isGuestView && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold shadow-sm hover:bg-slate-50 sm:px-4"
              >
                <Share2 className="h-4 w-4 shrink-0" />
                Share
              </button>
            )}
            <button
              type="button"
              onClick={() => setReloadKey((n) => n + 1)}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-60 sm:px-4"
            >
              <RefreshCw className={`h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </header>

        {/* KPI Cards */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <p className="text-xs font-semibold text-slate-500">{card.label}</p>
                <p className={`mt-1 text-xl font-extrabold ${card.color}`}>{loading ? "…" : card.value}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">{card.sub}</p>
              </article>
            );
          })}
        </section>

        {/* Tab strip — KPIs above stay fixed, only the view below swaps */}
        <div className="flex gap-0.5 rounded-lg bg-slate-100/80 p-1 shadow-sm sm:inline-flex sm:flex-wrap">
          {([
            { key: "completion", label: "Released Order Completion", short: "Completion", count: activeRows?.length ?? 0 },
            { key: "pending", label: "POs / WOs Left To Be Made", short: "Pending", count: rows?.length ?? 0 },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                "inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors sm:flex-none sm:px-4",
                tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
              <span
                className={[
                  "rounded-full px-1.5 py-0.5 text-[10px] font-extrabold",
                  tab === t.key ? "bg-[#173f70] text-white" : "bg-slate-200 text-slate-600",
                ].join(" ")}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Active view */}
        {tab === "pending" ? (
          <PendingOrdersSection
            rows={rows}
            loading={loading}
            error={error}
            onReload={() => setReloadKey((n) => n + 1)}
          />
        ) : (
          <ActiveOrdersSection
            rows={activeRows}
            loading={loading}
            error={error}
            onReload={() => setReloadKey((n) => n + 1)}
          />
        )}
      </div>

      {!isGuestView && (
        <ShareDashboardDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          createdBy={user?.name || user?.username}
        />
      )}
    </div>
  );
};

// ── Shared state placeholders ────────────────────────────────────────────────

const LoadingRow = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
    <Loader2 className="h-5 w-5 animate-spin" />
    <span className="text-sm font-semibold">{label}</span>
  </div>
);

const ErrorRow = ({ message, onReload }: { message: string; onReload: () => void }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
    <AlertCircle className="h-8 w-8 text-red-400" />
    <p className="text-sm font-semibold">{message}</p>
    <button
      type="button"
      onClick={onReload}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-slate-50"
    >
      <RefreshCw className="h-4 w-4" />
      Retry
    </button>
  </div>
);

// ── Section 1 — POs / WOs left to be made ─────────────────────────────────────

const PendingOrdersSection = ({
  rows,
  loading,
  error,
  onReload,
}: {
  rows: PendingRow[] | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) => {
  const [filter, setFilter] = useState<"All" | OrderKind>("All");

  const visible = (rows ?? []).filter((o) => filter === "All" || o.kind === filter);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">POs / WOs Left To Be Made</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Comparatives that have not yet become a Purchase / Work Order, with the stage they are waiting at
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100/80 p-1">
          {(["All", "PO", "WO"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={[
                "h-8 rounded-md px-3 text-xs font-extrabold transition-colors",
                filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingRow label="Loading from get_order_communication…" />
      ) : error ? (
        <ErrorRow message={error} onReload={onReload} />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
          <PackageCheck className="h-8 w-8" />
          <p className="text-sm font-medium">
            {(rows ?? []).length === 0
              ? "Every approved comparative already has an order — nothing pending"
              : "No pending items for this filter"}
          </p>
        </div>
      ) : (
        <>
        {/* Mobile: card list */}
        <ul className="divide-y divide-slate-100 md:hidden">
          {visible.map((o) => (
            <li key={o.comparisonId || o.prNumber} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${kindChip[o.kind]}`}>{o.kind}</span>
                <span className="text-sm font-extrabold text-blue-600">{o.prNumber}</span>
              </div>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-600">
                {o.vendorName || o.vendorId || "—"}
              </p>
              <div className="mt-2">
                <StageTracker doneIdx={o.doneIdx} />
              </div>
              <p className="mt-1.5 text-xs font-semibold text-slate-600">
                Pending at <span className="font-extrabold text-slate-900">{o.pendingStage}</span>
              </p>
            </li>
          ))}
        </ul>

        {/* Desktop: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                <th className="px-4 py-3">Req No.</th>
                <th className="px-4 py-3">Approved Vendor</th>
                <th className="px-4 py-3 w-[280px]">Progress</th>
                <th className="px-4 py-3">Pending At</th>
                <th className="px-4 py-3">Waiting</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.comparisonId || o.prNumber} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-blue-50/30">
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${kindChip[o.kind]}`}>{o.kind}</span>
                      <span className="font-extrabold text-blue-600">{o.prNumber}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                    {o.vendorName || o.vendorId || <span className="text-slate-400">—</span>}
                    {o.vendorName && o.vendorId && (
                      <span className="block text-xs font-medium text-slate-400">{o.vendorId}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StageTracker doneIdx={o.doneIdx} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-extrabold text-slate-800">{o.pendingStage}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      title="Time-at-stage will show once get_order_communication exposes stage timestamps"
                      className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-extrabold text-slate-400"
                    >
                      —
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-5 py-3 text-xs font-semibold text-slate-500">
        <span className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" /> Flow: {PRE_ORDER_STAGES.join("  →  ")}
        </span>
        <span className="text-slate-400">
          Source: <code className="rounded bg-slate-100 px-1 py-0.5">/purchase_flow/get_order_communication</code> · aging pending API support
        </span>
      </div>
    </section>
  );
};

const StageTracker = ({ doneIdx }: { doneIdx: number }) => (
  <div>
    <div className="flex items-center gap-1">
      {PRE_ORDER_STAGES.map((stage, i) => {
        const state = i <= doneIdx ? "done" : i === doneIdx + 1 ? "current" : "todo";
        return (
          <div
            key={stage}
            title={stage}
            className={[
              "h-1.5 flex-1 rounded-full",
              state === "done" ? "bg-[#173f70]" : state === "current" ? "bg-amber-400" : "bg-slate-200",
            ].join(" ")}
          />
        );
      })}
    </div>
    <p className="mt-1 text-[11px] font-semibold text-slate-400">
      {doneIdx + 1} / {PRE_ORDER_STAGES.length} stages done
    </p>
  </div>
);

// ── Section 2 — Released order completion ─────────────────────────────────────

const completionBucket = (pct: number) => {
  if (pct <= 0) return { label: "Not started", chip: "bg-slate-100 text-slate-600" };
  if (pct >= 100) return { label: "Completed", chip: "bg-emerald-100 text-emerald-700" };
  if (pct >= 60) return { label: "Near completion", chip: "bg-teal-100 text-teal-700" };
  return { label: "In progress", chip: "bg-blue-100 text-blue-700" };
};

type SortKey = "date" | "balance" | "orderNumber";
type SortState = { key: SortKey; dir: "asc" | "desc" };

const balanceOf = (o: ActiveRow) => Math.max(0, o.orderValue - o.doneValue);
const dateValue = (iso: string) => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const SortHeader = ({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) => {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={[
          "inline-flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide transition-colors",
          align === "right" ? "flex-row-reverse" : "",
          active ? "text-[#173f70]" : "text-slate-500 hover:text-slate-800",
        ].join(" ")}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-40"}`} />
      </button>
    </th>
  );
};

const ActiveOrdersSection = ({
  rows,
  loading,
  error,
  onReload,
}: {
  rows: ActiveRow[] | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) => {
  const [filter, setFilter] = useState<"All" | OrderKind>("All");
  // Default: oldest order on top.
  const [sort, setSort] = useState<SortState>({ key: "date", dir: "asc" });

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const all = rows ?? [];
  const visible = all
    .filter((o) => filter === "All" || o.kind === filter)
    .sort((a, b) => {
      let r = 0;
      if (sort.key === "date") r = dateValue(a.poDate) - dateValue(b.poDate);
      else if (sort.key === "balance") r = balanceOf(a) - balanceOf(b);
      else r = a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true });
      return sort.dir === "asc" ? r : -r;
    });

  // Orders with po_value = 0 from get_order_progress can't yield a completion %
  // — keep them out of the aggregate maths so one bad record doesn't skew it.
  const valued = all.filter((o) => o.orderValue > 0);
  const missingValueCount = all.length - valued.length;
  const totalValue = valued.reduce((s, o) => s + o.orderValue, 0);
  const totalDone = valued.reduce((s, o) => s + o.doneValue, 0);
  const overallPct = totalValue === 0 ? 0 : Math.round((totalDone / totalValue) * 100);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Released Order Completion</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            Completion = progress value ÷ order value. e.g. a ₹1,00,000 order with ₹30,000 done → 30% complete
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100/80 p-1">
          {(["All", "PO", "WO"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={[
                "h-8 rounded-md px-3 text-xs font-extrabold transition-colors",
                filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100 sm:grid-cols-4">
        {[
          { label: "Total Order Value", value: loading ? "…" : inrShort(totalValue) },
          { label: "Value Done So Far", value: loading ? "…" : inrShort(totalDone) },
          { label: "Balance", value: loading ? "…" : inrShort(totalValue - totalDone) },
          { label: "Overall Completion", value: loading ? "…" : `${overallPct}%` },
        ].map((s) => (
          <div key={s.label} className="px-5 py-4">
            <p className="text-xs font-semibold text-slate-500">{s.label}</p>
            <p className="mt-1 text-lg font-extrabold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      {!loading && missingValueCount > 0 && (
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-xs font-semibold text-amber-700">
          {missingValueCount} order{missingValueCount > 1 ? "s" : ""} returned <code className="rounded bg-amber-100 px-1">po_value = 0</code> from
          get_order_progress — completion % can&apos;t be computed and they are excluded from the totals above.
        </div>
      )}

      {loading ? (
        <LoadingRow label="Loading from get_order_progress…" />
      ) : error ? (
        <ErrorRow message={error} onReload={onReload} />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
          <PackageCheck className="h-8 w-8" />
          <p className="text-sm font-medium">
            {all.length === 0 ? "No released orders yet" : "No orders for this filter"}
          </p>
        </div>
      ) : (
        <>
        {/* Mobile: sort control + card list */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 md:hidden">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Sort</span>
          <select
            value={sort.key}
            onChange={(e) => setSort((s) => ({ ...s, key: e.target.value as SortKey }))}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold outline-none"
          >
            <option value="date">PO Date</option>
            <option value="orderNumber">Order No.</option>
            <option value="balance">Balance</option>
          </select>
          <button
            type="button"
            onClick={() => setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600"
          >
            {sort.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {sort.dir === "asc" ? "Asc" : "Desc"}
          </button>
        </div>
        <ul className="divide-y divide-slate-100 md:hidden">
          {visible.map((o) => {
            const hasValue = o.orderValue > 0;
            const pct = hasValue
              ? Math.max(0, Math.min(100, Math.round((o.doneValue / o.orderValue) * 100)))
              : 0;
            const bucket = completionBucket(pct);
            return (
              <li key={o.orderNumber} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${kindChip[o.kind]}`}>{o.kind}</span>
                  <span className="inline-flex items-center gap-1 truncate text-sm font-extrabold text-blue-600">
                    {o.kind === "WO" ? <Truck className="h-3.5 w-3.5 shrink-0" /> : <ShoppingCart className="h-3.5 w-3.5 shrink-0" />}
                    {o.orderNumber}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs font-semibold text-slate-600">
                  {(o.vendor || "—")} · {fmtDate(o.poDate)}
                </p>
                {hasValue ? (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-[#173f70]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-9 shrink-0 text-right text-xs font-extrabold text-slate-700">{pct}%</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${bucket.chip}`}>
                        {bucket.label}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-semibold text-slate-500">
                      <span>Value <span className="font-extrabold text-slate-900">{inr(o.orderValue)}</span></span>
                      <span>Done <span className="font-extrabold text-emerald-600">{inr(o.doneValue)}</span></span>
                      <span>Balance <span className="font-extrabold text-slate-700">{inr(Math.max(0, o.orderValue - o.doneValue))}</span></span>
                    </div>
                  </>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
                      N/A · order value missing
                    </span>
                    <span>Done <span className="font-extrabold text-emerald-600">{inr(o.doneValue)}</span></span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Desktop: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[960px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-500">
                <SortHeader label="Order No." sortKey="orderNumber" sort={sort} onSort={onSort} />
                <th className="px-4 py-3">Vendor</th>
                <SortHeader label="PO Date" sortKey="date" sort={sort} onSort={onSort} />
                <th className="px-4 py-3 text-right">Order Value</th>
                <th className="px-4 py-3 text-right">Done So Far</th>
                <th className="px-4 py-3 w-[240px]">Completion</th>
                <SortHeader label="Balance" sortKey="balance" sort={sort} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const hasValue = o.orderValue > 0;
                const pct = hasValue
                  ? Math.max(0, Math.min(100, Math.round((o.doneValue / o.orderValue) * 100)))
                  : 0;
                const bucket = completionBucket(pct);
                return (
                  <tr key={o.orderNumber} className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-blue-50/30">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${kindChip[o.kind]}`}>{o.kind}</span>
                        <span className="inline-flex items-center gap-1.5 font-extrabold text-blue-600">
                          {o.kind === "WO" ? <Truck className="h-3.5 w-3.5" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                          {o.orderNumber}
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      {o.vendor || <span className="text-slate-400">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-600">{fmtDate(o.poDate)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold text-slate-900">
                      {hasValue ? inr(o.orderValue) : <span className="text-amber-600">no value</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold text-emerald-600">{inr(o.doneValue)}</td>
                    <td className="px-4 py-3">
                      {hasValue ? (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-[#173f70]"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-9 shrink-0 text-right text-xs font-extrabold text-slate-700">{pct}%</span>
                          </div>
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${bucket.chip}`}>
                            {bucket.label}
                          </span>
                        </>
                      ) : (
                        <span
                          title="po_value = 0 in get_order_progress — completion % cannot be computed"
                          className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700"
                        >
                          N/A · order value missing
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-extrabold text-slate-500">
                      {hasValue ? inr(Math.max(0, o.orderValue - o.doneValue)) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      <div className="border-t border-slate-100 px-5 py-3 text-xs font-semibold text-slate-400">
        Source: <code className="rounded bg-slate-100 px-1 py-0.5">/purchase_flow/get_order_progress</code> · vendor names via get_order_communication
      </div>
    </section>
  );
};

export default ProcurementDashboard;
