import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import getBaseUrl from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import { type PRRInvoiceData } from "./PRRDocumentPreview";
import {
  updateLocalPrrStatus, PrrDocumentPreview, buildPrrPreviewFromPaymentFlow,
  type FinanceRecord, type PrrApiRecordLike,
} from "@/pages/FinanceAccounts";
import { DocPreviewPane, type SupportingDocument } from "./PaymentImpactMesh";

const safeStr = (v: unknown) => String(v ?? "").trim();
const money = (n?: number) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string) => {
  const v = safeStr(d);
  if (!v) return "—";
  const parsed = new Date(v);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : v;
};

// GRN (admin_grn_inspection) and WCC (admin_wcc_certificate) are both structured records with
// no uploaded PDF of their own — unlike the PRR or an invoice, there's nothing to hand a
// generic doc-link viewer, so they get their own certificate-style summary pages instead.
type GrnSigner = { name?: string; designation?: string; timestamp?: string };
type GrnItem = { item_code?: string; description?: string; uom?: string; received_qty?: number; unit_price?: number; gst_percent?: number; gst_amount?: number; total_grn_value?: number };
type GrnRecord = {
  grn_number?: string; grn_date?: string; order_number?: string; vendor_name?: string;
  invoice_no?: string; invoice_date?: string; status?: string; items?: GrnItem[];
  prepared_by?: GrnSigner; verified_by?: GrnSigner; approved_by?: GrnSigner;
};
type WccRecord = {
  certificate_id?: string; order_number?: string; vendor_name?: string; block_name?: string; scope_of_work?: string;
  from_date?: string; to_date?: string; rate_per_acre?: number; total_quantity?: number; total_certified_value?: number;
  annexure?: Record<string, unknown>; status?: string;
  prepared_by?: GrnSigner; verified_by?: GrnSigner; approved_by?: GrnSigner;
};

const ParticularsRow = ({ label, value, isLast = false }: { label: string; value: ReactNode; isLast?: boolean }) => (
  <tr className={isLast ? "" : "border-b border-slate-200"}>
    <td className="w-52 bg-slate-50 px-3 py-2 align-top font-bold text-slate-600">{label}</td>
    <td className="w-4 px-1 py-2 align-top text-slate-400">:</td>
    <td className="px-3 py-2 font-semibold text-slate-800">{value}</td>
  </tr>
);

const SignatureBoxes = ({ prepared, verified, approved }: { prepared?: GrnSigner; verified?: GrnSigner; approved?: GrnSigner }) => (
  <div className="mt-4 grid grid-cols-1 overflow-hidden rounded-lg border border-slate-200 sm:grid-cols-3">
    {([["Prepared By", prepared], ["Verified By", verified], ["Approved By", approved]] as [string, GrnSigner | undefined][]).map(([label, signer]) => (
      <div key={label} className="flex flex-col items-center justify-end gap-1.5 border-b border-slate-200 p-3 sm:border-b-0 sm:border-r sm:last:border-r-0">
        {signer?.name ? (
          <span className="inline-block rounded border border-gray-400 px-2 py-1 text-[10px] leading-tight">{signer.name}{signer.designation ? ` · ${signer.designation}` : ""}</span>
        ) : (
          <p className="text-sm font-semibold text-slate-400">Pending</p>
        )}
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
    ))}
  </div>
);

const GrnCertificatePage = ({ grn }: { grn: GrnRecord }) => {
  const items = grn.items ?? [];
  const total = items.reduce((sum, item) => sum + (Number(item.total_grn_value) || 0), 0);
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-center"><h2 className="text-base font-extrabold uppercase tracking-wide text-slate-900">Goods Receipt Note</h2></div>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs"><tbody>
          <ParticularsRow label="GRN No." value={grn.grn_number || "—"} />
          <ParticularsRow label="GRN Date" value={fmtDate(grn.grn_date)} />
          <ParticularsRow label="PO / Order No." value={grn.order_number || "—"} />
          <ParticularsRow label="Vendor" value={grn.vendor_name || "—"} />
          <ParticularsRow label="Invoice No. / Date" value={`${grn.invoice_no || "—"} / ${fmtDate(grn.invoice_date)}`} />
          <ParticularsRow label="Status" value={<span className="capitalize">{grn.status || "—"}</span>} isLast />
        </tbody></table>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead><tr className="bg-slate-800 text-white"><th className="px-3 py-2 text-left font-semibold">#</th><th className="px-3 py-2 text-left font-semibold">Item</th><th className="px-3 py-2 text-right font-semibold">Received Qty</th><th className="px-3 py-2 text-right font-semibold">Rate</th><th className="px-3 py-2 text-right font-semibold">GST</th><th className="px-3 py-2 text-right font-semibold">Value</th></tr></thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-b-0">
                <td className="px-3 py-2 align-top text-slate-500">{i + 1}</td>
                <td className="px-3 py-2 align-top text-slate-700"><div className="font-semibold text-slate-800">{item.description || item.item_code || "—"}</div><div className="text-[10px] text-slate-400">{item.item_code}{item.uom ? ` · ${item.uom}` : ""}</div></td>
                <td className="px-3 py-2 text-right align-top text-slate-600">{item.received_qty ?? "—"}</td>
                <td className="px-3 py-2 text-right align-top text-slate-600">{money(item.unit_price)}</td>
                <td className="px-3 py-2 text-right align-top text-slate-600">{item.gst_percent ?? 0}% ({money(item.gst_amount)})</td>
                <td className="px-3 py-2 text-right align-top font-semibold text-slate-800">{money(item.total_grn_value)}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No items recorded on this GRN.</td></tr>}
            <tr className="border-t-2 border-slate-400 bg-slate-50 font-bold"><td className="px-3 py-2" colSpan={5}>Total</td><td className="px-3 py-2 text-right">{money(total)}</td></tr>
          </tbody>
        </table>
      </div>
      <SignatureBoxes prepared={grn.prepared_by} verified={grn.verified_by} approved={grn.approved_by} />
    </section>
  );
};

const WccCertificatePage = ({ wcc }: { wcc: WccRecord }) => {
  const annexureEntries = wcc.annexure && typeof wcc.annexure === "object" ? Object.entries(wcc.annexure) : [];
  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-center"><h2 className="text-base font-extrabold uppercase tracking-wide text-slate-900">Work Completion Certificate</h2></div>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs"><tbody>
          <ParticularsRow label="Certificate No." value={wcc.certificate_id || "—"} />
          <ParticularsRow label="Order No." value={wcc.order_number || "—"} />
          <ParticularsRow label="Vendor" value={wcc.vendor_name || "—"} />
          <ParticularsRow label="Block" value={wcc.block_name || "—"} />
          <ParticularsRow label="Scope of Work" value={wcc.scope_of_work || "—"} />
          <ParticularsRow label="Period" value={`${fmtDate(wcc.from_date)} – ${fmtDate(wcc.to_date)}`} />
          <ParticularsRow label="Rate / Acre" value={money(wcc.rate_per_acre)} />
          <ParticularsRow label="Total Quantity" value={String(wcc.total_quantity ?? "—")} />
          <ParticularsRow label="Total Certified Value" value={money(wcc.total_certified_value)} />
          <ParticularsRow label="Status" value={<span className="capitalize">{wcc.status || "—"}</span>} isLast />
        </tbody></table>
      </div>
      {annexureEntries.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-xs">
            <thead><tr className="bg-slate-800 text-white"><th className="px-3 py-2 text-left font-semibold">Entry</th><th className="px-3 py-2 text-left font-semibold">Details</th></tr></thead>
            <tbody>
              {annexureEntries.map(([key, value], i) => (
                <tr key={key} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-2 align-top text-slate-500">{i + 1}. {key}</td>
                  <td className="px-3 py-2 align-top text-slate-700">{value && typeof value === "object" ? Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : String(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SignatureBoxes prepared={wcc.prepared_by} verified={wcc.verified_by} approved={wcc.approved_by} />
    </section>
  );
};

export type PRRApprovalInvoice = PRRInvoiceData & {
  vendor_name?: string;
  admin_ops_approval_status?: string;
  director_approval_status?: string;
  // The Bill Inward invoice this PRR was raised from (admin_payment_flow.source_invoice_id,
  // set by create_and_submit_prr) — resolved to pull the actual Tax Invoice document and any
  // additional documents attached at Bill Inward time.
  source_invoice_id?: string;
  // Everything the Create PRR popup captured with no home in send_for_approval's own
  // admin_accounts_prr shape — same field the PRR Module's own "Sent for Approval" preview reads.
  prr_form_extra?: Parameters<typeof buildPrrPreviewFromPaymentFlow>[0]["prr_form_extra"];
  // Set when this card came from the localStorage-only Payments & Receipts "Create PRR" form
  // (FinanceAccounts.tsx) rather than the real backend-tracked admin_payment_flow — approve/
  // reject writes straight back to that same localStorage register instead of calling the API.
  origin?: "backend" | "local";
  localRecordId?: string;
  // The full local record, so the "PRR Document" popup below can render it through the exact
  // same PrrDocumentPreview component the backend-origin branch uses too (via
  // buildPrrPreviewFromPaymentFlow) — same layout, same fields, either way.
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
  const isLocal = invoice.origin === "local";

  // The real admin_accounts_prr record — needed for the same live PrrDocumentPreview the PRR
  // Module's own "Sent for Approval" preview renders through (buildPrrPreviewFromPaymentFlow).
  const [prrRecord, setPrrRecord] = useState<PrrApiRecordLike | null>(null);
  useEffect(() => {
    if (isLocal || !invoice.prr_number) { setPrrRecord(null); return; }
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_prr/${encodeURIComponent(invoice.prr_number!)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: PrrApiRecordLike } | null = await res.json().catch(() => null);
        if (res.ok && data?.success && data.data) setPrrRecord(data.data);
      } catch {
        // best-effort — the live preview still renders from the payment-flow fields alone
      }
    })();
    return () => ac.abort();
  }, [isLocal, invoice.prr_number]);

  // The Bill Inward invoice this PRR was raised from — its own Tax Invoice document and any
  // additional documents attached at inward time (the "Invoice" / "Any additional document"
  // pages below), resolved separately from the order-scoped supporting-documents API since
  // that one only ever carries PO/WO/GRN/WCC-side documents, never the Bill Inward's own.
  const [sourceInvoice, setSourceInvoice] = useState<{
    invoice_details?: { invoice_doc_url?: string };
    additional_documents?: Array<{ name?: string; url?: string }>;
    purchase_order_details?: { cupporting_documents?: Array<{ document_type?: string; document_number?: string }> };
  } | null>(null);
  useEffect(() => {
    if (isLocal || !invoice.source_invoice_id) { setSourceInvoice(null); return; }
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/admin_accounts/get_invoice/${encodeURIComponent(invoice.source_invoice_id!)}`, {
          headers: { Accept: "application/json" }, signal: ac.signal,
        });
        const data: { success?: boolean; data?: typeof sourceInvoice } | null = await res.json().catch(() => null);
        if (res.ok && data?.success && data.data) setSourceInvoice(data.data);
      } catch {
        // best-effort — the Invoice page just won't render if this can't be resolved
      }
    })();
    return () => ac.abort();
  }, [isLocal, invoice.source_invoice_id]);

  const { details: prrDetails, record: prrPreviewRecord } = buildPrrPreviewFromPaymentFlow(invoice, prrRecord);

  // GRN/WCC document numbers the invoice itself was linked against at Bill Inward time —
  // resolved into the actual structured GRN/WCC records below (neither has an uploaded PDF).
  const supportingDocRefs = sourceInvoice?.purchase_order_details?.cupporting_documents ?? [];
  const grnNumbers = supportingDocRefs.filter((d) => safeStr(d.document_type).toUpperCase() === "GRN").map((d) => safeStr(d.document_number)).filter(Boolean);
  const wccNumbers = supportingDocRefs.filter((d) => safeStr(d.document_type).toUpperCase() === "WCC").map((d) => safeStr(d.document_number)).filter(Boolean);

  const [grnRecords, setGrnRecords] = useState<GrnRecord[]>([]);
  useEffect(() => {
    if (!grnNumbers.length) { setGrnRecords([]); return; }
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const results = await Promise.all(grnNumbers.map(async (grnNumber) => {
          const res = await fetch(`${baseUrl}/admin_grn_inspection/get_by_id/${encodeURIComponent(grnNumber)}`, { headers: { Accept: "application/json" }, signal: ac.signal });
          const data: { success?: boolean; grn?: GrnRecord } | null = await res.json().catch(() => null);
          return data?.success ? data.grn ?? null : null;
        }));
        setGrnRecords(results.filter((r): r is GrnRecord => Boolean(r)));
      } catch {
        // best-effort — GRN page just won't render if these can't be resolved
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grnNumbers.join(",")]);

  const [wccRecords, setWccRecords] = useState<WccRecord[]>([]);
  useEffect(() => {
    if (!wccNumbers.length) { setWccRecords([]); return; }
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = safeStr(getBaseUrl()).replace(/\/$/, "");
        const results = await Promise.all(wccNumbers.map(async (certificateId) => {
          const res = await fetch(`${baseUrl}/admin_wcc_certificate/get_by_id/${encodeURIComponent(certificateId)}`, { headers: { Accept: "application/json" }, signal: ac.signal });
          const data: { success?: boolean; certificate?: WccRecord } | null = await res.json().catch(() => null);
          return data?.success ? data.certificate ?? null : null;
        }));
        setWccRecords(results.filter((r): r is WccRecord => Boolean(r)));
      } catch {
        // best-effort — WCC page just won't render if these can't be resolved
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wccNumbers.join(",")]);

  // Same order-scoped documents PaymentRequestPanel's "Supporting Documents" card already
  // pulls from (admin_purchase_flow's purchase_flow_stage uploads) — order_number for a
  // backend-tracked PRR, or the linked PO/WO reference for a local one (only populated when
  // the PRR was linked to a real, backend-synced Bill Inward). GRN/WCC/log-book documents
  // live in here; PO acceptance / proforma / other order-side documents fall into "any
  // additional document" alongside the Bill Inward's own additional uploads.
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

  // Ordered exactly as requested: PRR (page 1, rendered separately below), then GRN/WCC, then
  // the Invoice itself, then any other/additional document. GRN/WCC render as real certificate
  // pages (grnRecords/wccRecords, structured data — no PDF exists for either); any GRN/WCC-
  // labeled upload that *does* have a doc_link (an older/manual attachment) still shows too.
  const referenceDocs = docs.filter((d) => isReferenceDoc(d.document));
  const invoiceDocs: SupportingDocument[] = isLocal
    ? (linkedBill?.attachmentUrl ? [{ document: "Invoice", doc_link: linkedBill.attachmentUrl }] : [])
    : (sourceInvoice?.invoice_details?.invoice_doc_url ? [{ document: "Invoice", doc_link: String(sourceInvoice.invoice_details.invoice_doc_url) }] : []);
  const additionalDocs: SupportingDocument[] = [
    ...docs.filter((d) => !isReferenceDoc(d.document)),
    ...(isLocal
      ? Object.entries(linkedBill?.additionalDocumentUrls ?? {}).map(([name, url]) => ({ document: name, doc_link: url }))
      : (sourceInvoice?.additional_documents ?? []).map((doc) => ({ document: String(doc.name ?? doc.url ?? "Additional Document"), doc_link: String(doc.url ?? "") }))),
  ];

  type ApprovalPage = { key: string; label: string; node: ReactNode };
  const docPage = (doc: SupportingDocument): ReactNode => <div style={{ height: A4_HEIGHT }}><DocPreviewPane doc={doc} /></div>;
  const pages: ApprovalPage[] = [
    ...referenceDocs.map((doc, i): ApprovalPage => ({ key: `ref-${i}`, label: doc.document || "Reference Document", node: docPage(doc) })),
    ...grnRecords.map((grn, i): ApprovalPage => ({ key: `grn-${i}`, label: `GRN — ${grn.grn_number || "Goods Receipt Note"}`, node: <GrnCertificatePage grn={grn} /> })),
    ...wccRecords.map((wcc, i): ApprovalPage => ({ key: `wcc-${i}`, label: `WCC — ${wcc.certificate_id || "Work Completion Certificate"}`, node: <WccCertificatePage wcc={wcc} /> })),
    ...invoiceDocs.map((doc, i): ApprovalPage => ({ key: `invoice-${i}`, label: doc.document || "Invoice", node: docPage(doc) })),
    ...additionalDocs.map((doc, i): ApprovalPage => ({ key: `other-${i}`, label: doc.document || "Document", node: docPage(doc) })),
  ];

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

      {/* One popup, one continuous document set — the PRR itself, then GRN / WCC, then the
          Invoice, then any other/additional document, each as its own numbered page, in that
          order. Page 1 renders through the exact same PrrDocumentPreview component (and same
          field mapping, via buildPrrPreviewFromPaymentFlow) the PRR Module's own previews use,
          so a director sees the identical document an initiator did. */}
      <ReviewPopup title="PRR & Reference Documents" bodyClassName="bg-slate-100 p-4">
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">Page 1 — PRR</p>
            <A4PageFrame>
              {isLocal && invoice.localRecord?.prrDetails ? (
                <PrrDocumentPreview
                  record={invoice.localRecord}
                  details={invoice.localRecord.prrDetails}
                  taxInvoiceName={linkedBill?.attachmentName || invoice.localRecord.attachmentName || "Not linked"}
                  poWoName={invoice.localRecord.poWoReference || "Not linked"}
                  completionName={invoice.localRecord.grnServiceReference || "Not linked"}
                />
              ) : (
                <PrrDocumentPreview
                  record={prrPreviewRecord}
                  details={prrDetails}
                  taxInvoiceName={prrDetails.invoiceNumber || "Not linked"}
                  poWoName={prrPreviewRecord.poWoReference || "Not linked"}
                  completionName={prrPreviewRecord.grnServiceReference || "Not linked"}
                />
              )}
            </A4PageFrame>
          </div>

          {pages.map((page, i) => (
            <div key={page.key}>
              <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">Page {i + 2} — {page.label}</p>
              <A4PageFrame>{page.node}</A4PageFrame>
            </div>
          ))}

          {pages.length === 0 && (
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
