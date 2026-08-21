import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import getBaseUrl from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import PRRDocumentPreview, { type PRRInvoiceData } from "./PRRDocumentPreview";
import { updateLocalPrrStatus, PrrDocumentPreview as LocalPrrDocumentPreview, type FinanceRecord } from "@/pages/FinanceAccounts";
import { DocPreviewPane, type SupportingDocument } from "./PaymentImpactMesh";

const safeStr = (v: unknown) => String(v ?? "").trim();

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
  // A PRR's own attachmentUrl is always blank — its real Tax Invoice / supporting-document
  // URLs live on the Bill Inward record it was raised against (resolved via sourceBillId).
  localLinkedBill?: FinanceRecord;
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

// Chrome around the single review popup — a titled window, not just a bare card.
const ReviewPopup = ({ title, bodyClassName = "p-4", children }: { title: string; bodyClassName?: string; children: ReactNode }) => (
  <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" style={{ height: "80vh" }}>
    <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
      <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">{title}</h4>
    </div>
    <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
  </div>
);

// Full 1:1 A4 physical size (794×1123px) — this is the only popup now, so there's no need to
// shrink it to fit side-by-side with anything else.
const A4_WIDTH = 794;
const A4_HEIGHT = Math.round(A4_WIDTH * (297 / 210));

const A4PageFrame = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto bg-white shadow-md" style={{ width: A4_WIDTH, minHeight: A4_HEIGHT }}>
    {children}
  </div>
);

// step_3/"grn" and similar upload steps in purchase_flow_stage — plus a released WCC
// certificate, wherever the document label happens to say so — are the "reference documents"
// page; everything else (invoice, PO acceptance, proforma invoice, the order document itself)
// is the "invoices & other documents" page.
const isReferenceDoc = (label: string) => /grn|wcc|certificate|log.?\s*book/i.test(label);

// The director's side of the PRR workflow: review the PRR document plus every reference and
// supporting document as one continuous page-by-page set, then approve/reject. The initiator's
// (admin_ops) signature already happened when "Make PRR & Send for Approval" was clicked back
// in the Payment Request tab — nothing here re-signs that.
const PRRApprovalPanel = ({
  invoice, onDecided, onClose,
}: { invoice: PRRApprovalInvoice; onDecided: () => void; onClose?: () => void }) => {
  const { user } = useAuth();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const canDecide = safeStr(invoice.director_approval_status).toLowerCase() === "pending";

  // Same order-scoped documents PaymentRequestPanel's "Supporting Documents" card already
  // pulls from (admin_purchase_flow's purchase_flow_stage uploads) — order_number for a
  // backend-tracked PRR, or the linked PO/WO reference for a local one (only populated when
  // the PRR was linked to a real, backend-synced Bill Inward).
  const orderNumber = safeStr(invoice.order_number) || safeStr(invoice.localRecord?.poWoReference);
  const [docs, setDocs] = useState<SupportingDocument[]>([]);
  useEffect(() => {
    if (!orderNumber) { setDocs([]); return; }
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_supporting_documents/${encodeURIComponent(orderNumber)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: SupportingDocument[] } | null = await res.json().catch(() => null);
        if (res.ok && data?.success) setDocs(Array.isArray(data.data) ? data.data : []);
      } catch {
        // best-effort — the PRR page still renders without the reference/other-document pages
      }
    })();
    return () => ac.abort();
  }, [orderNumber]);

  // A local PRR's own record never carries real document URLs — its Tax Invoice and any other
  // supporting files live on the Bill Inward it was raised against (localLinkedBill), same as
  // the "SUPPORTING DOCUMENTS" section on Page 1 itself resolves them.
  const linkedBill = invoice.localLinkedBill;
  const localSupportingDocs: SupportingDocument[] = [
    ...(linkedBill?.attachmentUrl ? [{ document: "Tax Invoice", doc_link: linkedBill.attachmentUrl }] : []),
    ...Object.entries(linkedBill?.additionalDocumentUrls ?? {}).map(([name, url]) => ({ document: name, doc_link: url })),
  ];

  const allDocs = [...docs, ...localSupportingDocs];
  const referenceDocs = allDocs.filter((d) => isReferenceDoc(d.document));
  const otherDocs = allDocs.filter((d) => !isReferenceDoc(d.document));

  const handleApprove = async () => {
    if (invoice.origin === "local") {
      if (!invoice.localRecordId) { toast.error("Missing record id."); return; }
      if (!user?.name) { toast.error("You must be logged in to approve this."); return; }
      setApproving(true);
      updateLocalPrrStatus(invoice.localRecordId, "Approved", { name: user.name, designation: user.designation });
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
      if (!user?.name) { toast.error("You must be logged in to reject this."); return; }
      setRejecting(true);
      updateLocalPrrStatus(invoice.localRecordId, "Rejected", { name: user.name, designation: user.designation }, rejectReason.trim());
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

      {/* One popup, one continuous document set — the PRR itself, then every reference document
          (GRN / WCC / Log Book) and every other supporting document (invoices, PO acceptance,
          etc.), each as its own numbered page, in that order. */}
      <ReviewPopup title="PRR & Reference Documents" bodyClassName="bg-slate-100 p-4">
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">Page 1 — PRR</p>
            <A4PageFrame>
              {invoice.origin === "local" && invoice.localRecord?.prrDetails ? (
                <LocalPrrDocumentPreview
                  record={invoice.localRecord}
                  details={invoice.localRecord.prrDetails}
                  taxInvoiceName={linkedBill?.attachmentName || invoice.localRecord.attachmentName || "Not linked"}
                  poWoName={invoice.localRecord.poWoReference || "Not linked"}
                  completionName={invoice.localRecord.grnServiceReference || "Not linked"}
                />
              ) : (
                <PRRDocumentPreview invoice={invoice} />
              )}
            </A4PageFrame>
          </div>

          {referenceDocs.map((doc, i) => (
            <div key={`ref-${i}`}>
              <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">Page {i + 2} — {doc.document || "Reference Document"}</p>
              <A4PageFrame>
                <div style={{ height: A4_HEIGHT }}><DocPreviewPane doc={doc} /></div>
              </A4PageFrame>
            </div>
          ))}

          {otherDocs.map((doc, i) => (
            <div key={`other-${i}`}>
              <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">Page {referenceDocs.length + i + 2} — {doc.document || "Document"}</p>
              <A4PageFrame>
                <div style={{ height: A4_HEIGHT }}><DocPreviewPane doc={doc} /></div>
              </A4PageFrame>
            </div>
          ))}

          {allDocs.length === 0 && (
            <p className="py-6 text-center text-xs font-semibold text-slate-400">
              {orderNumber ? "No reference or supporting documents found for this order." : "No linked order — reference and supporting documents aren't available."}
            </p>
          )}
        </div>
      </ReviewPopup>

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
