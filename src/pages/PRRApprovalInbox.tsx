import { useCallback, useEffect, useState } from "react";
import { FileCheck, RefreshCw, Calendar } from "lucide-react";
import getBaseUrl from "@/lib/config";
import PRRApprovalPanel, { type PRRApprovalInvoice } from "@/components/accounts/PRRApprovalPanel";
import { getLocalPendingPrrRecords, type FinanceRecord } from "@/pages/FinanceAccounts";

const BASE_URL = getBaseUrl().replace(/\/$/, "");

const formatDate = (d?: string) => {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
};

// Payments & Receipts' "Create Payment Request / PRR" form has no backend of its own — a
// Submitted record there only ever lives in localStorage. This maps one into the same shape
// the backend-tracked cards use, so it shows up in this one director inbox either way.
const mapLocalRecordToApprovalInvoice = (record: FinanceRecord): PRRApprovalInvoice => {
  const budget_impact: Record<string, Record<string, unknown>> = {};
  (record.prrDetails?.budgetLines ?? []).forEach((line, idx) => {
    const budgetId = line.budgetId || line.budgetName || `budget_${idx}`;
    if (!budget_impact[budgetId]) budget_impact[budgetId] = {};
    budget_impact[budgetId][line.lineItemId || `item_${idx}`] = {
      line_item_name: line.lineItem,
      category: line.category,
      type: "",
      impact_amount: line.amount,
    };
  });

  return {
    payment_id: `local:${record.id}`,
    prr_number: record.reference,
    vendor_name: record.party,
    vendor_id: record.vendorId,
    created_at: record.date,
    admin_ops_approval_status: "pending",
    director_approval_status: "pending",
    origin: "local",
    localRecordId: record.id,
    localRecord: record,
    payment_request_dict: {
      payment: {
        payment_amount: record.prrDetails?.netPayableAmount ?? record.amount,
        actual_payable_amount: record.prrDetails?.actualPayableAmount,
        remarks: record.prrDetails?.requesterRemarks,
      },
      budget_impact,
    },
  };
};

// Director-facing inbox — mirrors WccApprovalInbox / GrnApprovalInbox's list+popup pattern.
// No dedicated "pending PRRs" endpoint exists yet, so this scans the same get_payment_flow
// list every other tab already uses and filters client-side, same as elsewhere in this module.
// Local (localStorage-only) submitted PRRs are merged in alongside the backend-tracked ones —
// this inbox is the one place both PRR sources are reviewed from.
const PRRApprovalInbox = () => {
  const [items, setItems] = useState<PRRApprovalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchPending = useCallback(() => {
    setLoading(true);
    const localItems = getLocalPendingPrrRecords().map(mapLocalRecordToApprovalInvoice);
    fetch(`${BASE_URL}/admin_accounts/get_payment_flow`)
      .then((res) => res.json())
      .then((data: { success?: boolean; data?: PRRApprovalInvoice[] }) => {
        const all = data?.success && Array.isArray(data.data) ? data.data : [];
        const pending = all.filter((it) => String(it.director_approval_status ?? "").toLowerCase() === "pending");
        setItems([...pending, ...localItems]);
      })
      .catch(() => setItems(localItems))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending, refreshKey]);

  const selected = items.find((it) => it.payment_id === selectedId) ?? null;

  return (
    <div className="min-h-screen space-y-6 bg-gray-50/50 p-8 font-sans">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3 shadow-sm">
            <FileCheck className="h-7 w-7 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">PRR Approval</h1>
            <p className="mt-1 max-w-lg text-sm text-slate-500">Payment Release Requests awaiting your final approval.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 md:self-auto"
        >
          <RefreshCw className="h-4 w-4 text-gray-400" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-gray-100 bg-white" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-100 bg-white py-24 text-center">
          <FileCheck className="h-10 w-10 text-gray-200" />
          <p className="text-sm font-semibold text-slate-600">Nothing pending</p>
          <p className="max-w-xs text-xs text-slate-400">No PRRs are currently awaiting approval.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <button
              key={it.payment_id}
              type="button"
              onClick={() => setSelectedId(it.payment_id ?? null)}
              className="rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800">{it.vendor_name || "—"}</p>
                  <p className="truncate font-mono text-[11px] text-slate-400">{it.order_number || "—"}</p>
                </div>
                <span className="shrink-0 text-sm font-bold text-slate-800">
                  ₹{(Number(it.payment_request_dict?.payment?.payment_amount) || 0).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1 text-[11px] text-slate-500">
                <Calendar className="h-3 w-3" /> {formatDate(it.created_at)}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-auto bg-slate-950/45 p-4">
          <PRRApprovalPanel
            invoice={selected}
            onDecided={() => { setSelectedId(null); setRefreshKey((k) => k + 1); }}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
};

export default PRRApprovalInbox;
