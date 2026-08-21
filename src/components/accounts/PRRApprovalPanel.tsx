import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import getBaseUrl from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import PRRDocumentPreview, { type PRRInvoiceData } from "./PRRDocumentPreview";
import { updateLocalPrrStatus, PrrDocumentPreview as LocalPrrDocumentPreview, type FinanceRecord } from "@/pages/FinanceAccounts";

const safeStr = (v: unknown) => String(v ?? "").trim();
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type PRRApprovalInvoice = PRRInvoiceData & {
  vendor_name?: string;
  admin_ops_approval_status?: string;
  director_approval_status?: string;
  // Set when this card came from the localStorage-only Payments & Receipts "Create PRR" form
  // (FinanceAccounts.tsx) rather than the real backend-tracked admin_payment_flow — approve/
  // reject writes straight back to that same localStorage register instead of calling the API.
  origin?: "backend" | "local";
  localRecordId?: string;
  // The full local record, so the "PRR Document" popup below can render it through the exact
  // same PrrDocumentPreview the Payments & Receipts form itself uses — same layout, same
  // fields — instead of force-fitting it into the backend-shaped PRRDocumentPreview.
  localRecord?: FinanceRecord;
};

type StepStatus = "done" | "pending" | "rejected";
const DOT_CLASS: Record<StepStatus, string> = { done: "bg-emerald-500", pending: "bg-orange-500", rejected: "bg-red-500" };
const stepStatus = (raw: string): StepStatus => (raw === "approved" ? "done" : raw === "rejected" ? "rejected" : "pending");

const StepBadge = ({ label, raw }: { label: string; raw?: string }) => (
  <div className="flex items-center gap-1.5">
    <span className={`h-2.5 w-2.5 rounded-full ${DOT_CLASS[stepStatus(safeStr(raw).toLowerCase())]}`} />
    <span className="text-xs font-semibold text-slate-600">{label}: <span className="capitalize">{raw || "Not Initiated"}</span></span>
  </div>
);

// Chrome around each of the two review popups — a titled window, not just a bare card, so the
// PRR and Investment Impact read as two distinct popups rather than one merged panel.
const ReviewPopup = ({ title, bodyClassName = "p-4", children }: { title: string; bodyClassName?: string; children: ReactNode }) => (
  <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" style={{ height: "75vh" }}>
    <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
      <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">{title}</h4>
    </div>
    <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
  </div>
);

// A4 at ~63% scale — big enough to actually read as a document "page" side by side with the
// Investment Impact popup, without needing the full 1:1 794×1123px physical size.
const A4_WIDTH = 520;
const A4_HEIGHT = Math.round(A4_WIDTH * (297 / 210));

const A4PageFrame = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto bg-white shadow-md" style={{ width: A4_WIDTH, minHeight: A4_HEIGHT }}>
    {children}
  </div>
);

const InvestmentImpactTable = ({ invoice }: { invoice: PRRInvoiceData }) => {
  const raw = invoice.payment_request_dict?.linvestment_impact as { entries?: Record<string, unknown> } | undefined;
  const entries = raw?.entries;
  const rows = entries && typeof entries === "object"
    ? Object.values(entries as Record<string, unknown>).map((v) => {
        const e = v as { land_owner?: string; acres?: number; investment_amount?: number };
        return { ownerName: safeStr(e.land_owner), acres: Number(e.acres) || 0, investment: Number(e.investment_amount) || 0 };
      })
    : [];

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-xs font-semibold text-slate-400">
        Not applicable for this payment — no land investment impact recorded.
      </p>
    );
  }

  const totalAcres = rows.reduce((s, r) => s + r.acres, 0);
  const totalInvestment = rows.reduce((s, r) => s + r.investment, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Land Owner</th>
            <th className="px-3 py-2 text-right">Acres</th>
            <th className="px-3 py-2 text-right">Investment</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-b-0">
              <td className="px-3 py-2 font-semibold text-slate-700">{r.ownerName || "—"}</td>
              <td className="px-3 py-2 text-right text-slate-600">{r.acres.toFixed(2)}</td>
              <td className="px-3 py-2 text-right font-semibold text-slate-800">{inr(r.investment)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right">{totalAcres.toFixed(2)}</td>
            <td className="px-3 py-2 text-right">{inr(totalInvestment)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// The director's side of the PRR workflow: review the PRR document + land investment impact,
// then approve/reject. The initiator's (admin_ops) signature already happened when "Make PRR &
// Send for Approval" was clicked back in the Payment Request tab — nothing here re-signs that.
const PRRApprovalPanel = ({
  invoice, onDecided, onClose,
}: { invoice: PRRApprovalInvoice; onDecided: () => void; onClose?: () => void }) => {
  const { user } = useAuth();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const canDecide = safeStr(invoice.director_approval_status).toLowerCase() === "pending";

  const handleApprove = async () => {
    if (invoice.origin === "local") {
      if (!invoice.localRecordId) { toast.error("Missing record id."); return; }
      setApproving(true);
      updateLocalPrrStatus(invoice.localRecordId, "Approved");
      toast.success("Approved");
      setApproving(false);
      onDecided();
      return;
    }
    if (!invoice.payment_id) { toast.error("Missing payment id."); return; }
    if (!user?.id || !user?.name) { toast.error("You must be logged in to approve this."); return; }
    setApproving(true);
    try {
      const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/admin_accounts/director_approve_payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ payment_id: invoice.payment_id, staff_id: user.id, name: user.name, designation: user.designation || "" }),
      });
      const resData: { success?: boolean; message?: string; prr_number?: string } | null = await res.json().catch(() => null);
      if (!res.ok || !resData?.success) throw new Error(resData?.message || `Failed to approve (HTTP ${res.status})`);
      toast.success(resData.prr_number ? `Approved — PRR ${resData.prr_number} finalized` : "Approved");
      onDecided();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!showRejectInput) { setShowRejectInput(true); return; }
    if (invoice.origin === "local") {
      if (!invoice.localRecordId) { toast.error("Missing record id."); return; }
      setRejecting(true);
      updateLocalPrrStatus(invoice.localRecordId, "Rejected", rejectReason.trim());
      toast.success("Rejected");
      setShowRejectInput(false);
      setRejectReason("");
      setRejecting(false);
      onDecided();
      return;
    }
    if (!invoice.payment_id) { toast.error("Missing payment id."); return; }
    if (!user?.id || !user?.name) { toast.error("You must be logged in to reject this."); return; }
    setRejecting(true);
    try {
      const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/admin_accounts/director_reject_payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          payment_id: invoice.payment_id, staff_id: user.id, name: user.name, designation: user.designation || "",
          reason: rejectReason.trim(),
        }),
      });
      const resData: { success?: boolean; message?: string } | null = await res.json().catch(() => null);
      if (!res.ok || !resData?.success) throw new Error(resData?.message || `Failed to reject (HTTP ${res.status})`);
      toast.success("Rejected — payment reset for adjustment");
      setShowRejectInput(false);
      setRejectReason("");
      onDecided();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      {/* Utility strip — NOT a popup itself, just vendor/status context (+ close, when this is
          being shown inside a real modal). The two ReviewPopups below are the only "popups". */}
      <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-5 py-3 shadow-lg">
        <div>
          <p className="text-sm font-extrabold text-slate-900">{safeStr(invoice.vendor_name) || "—"}</p>
          <p className="text-xs font-medium text-slate-400">{safeStr(invoice.order_number) || "—"}</p>
        </div>
        <div className="flex items-center gap-4">
          <StepBadge label="Admin Ops" raw={invoice.admin_ops_approval_status} />
          <StepBadge label="Director" raw={invoice.director_approval_status} />
          {onClose && (
            <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Popup 1: PRR document, shown at A4-page scale. Popup 2: land investment impact. Two
          fully independent floating windows, not two panes of one shared popup. */}
      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
        <ReviewPopup title="PRR Document" bodyClassName="bg-slate-100 p-4">
          <A4PageFrame>
            {invoice.origin === "local" && invoice.localRecord?.prrDetails ? (
              <LocalPrrDocumentPreview
                record={invoice.localRecord}
                details={invoice.localRecord.prrDetails}
                taxInvoiceName={invoice.localRecord.attachmentName || "Not linked"}
                poWoName={invoice.localRecord.poWoReference || "Not linked"}
                completionName={invoice.localRecord.grnServiceReference || "Not linked"}
              />
            ) : (
              <PRRDocumentPreview invoice={invoice} />
            )}
          </A4PageFrame>
        </ReviewPopup>
        <ReviewPopup title="Investment Impact">
          <InvestmentImpactTable invoice={invoice} />
        </ReviewPopup>
      </div>

      {canDecide && (
        <div className="space-y-2 rounded-xl bg-white px-5 py-4 shadow-lg">
          {showRejectInput && (
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection…"
              className="min-h-16 w-full max-w-md resize-none rounded-md border border-slate-200 p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-slate-300"
              autoFocus
            />
          )}
          <div className="flex items-center gap-2">
            {showRejectInput && (
              <button
                type="button"
                onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
                className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleReject}
              disabled={approving || rejecting}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 px-5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {rejecting ? "Rejecting…" : showRejectInput ? "Confirm Reject" : "Reject"}
            </button>
            {!showRejectInput && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={approving || rejecting}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {approving ? "Approving…" : "Approve"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PRRApprovalPanel;
